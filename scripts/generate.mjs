import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataPath = path.join(root, 'public/data/examples.json');
const audioDir = path.join(root, 'public/audio');
const generationModel = process.env.OPENROUTER_AUDIO_MODEL || 'openai/gpt-audio-mini';
const judgmentModel = '@cf/cloudflare/clef-omni';
const threshold = 0.5;
const voice = 'alloy';
const cases = [
  {
    id: 'manana-manzana', category: 'Similar sounds', title: 'Apple or tomorrow?',
    prompt: 'Say “apple” in Spanish.', expectedText: 'manzana', spokenText: 'mañana',
    expectedTranslation: 'apple', spokenTranslation: 'tomorrow', expectedCorrect: false,
    note: 'Mañana means “tomorrow,” not “apple” (manzana), despite the similar sounds.',
  },
  {
    id: 'manzana-control', category: 'Correct control', title: 'An actual apple',
    prompt: 'Say “apple” in Spanish.', expectedText: 'manzana', spokenText: 'manzana',
    expectedTranslation: 'apple', spokenTranslation: 'apple', expectedCorrect: true,
    note: 'The spoken word matches the requested Spanish word for apple.',
  },
  {
    id: 'quince-cincuenta', category: 'Changed number', title: 'Fifteen or fifty?',
    prompt: 'Say “I am fifteen years old” in Spanish.', expectedText: 'Tengo quince años.', spokenText: 'Tengo cincuenta años.',
    expectedTranslation: 'I am fifteen years old.', spokenTranslation: 'I am fifty years old.', expectedCorrect: false,
    note: 'Cincuenta changes the age to fifty; the drill asks for fifteen (quince).',
  },
  {
    id: 'dropped-negation', category: 'Missing negation', title: 'A coffee reversal',
    prompt: 'Say “I don\'t want coffee” in Spanish.', expectedText: 'No quiero café.', spokenText: 'Quiero café.',
    expectedTranslation: "I don't want coffee.", spokenTranslation: 'I want coffee.', expectedCorrect: false,
    note: 'Omitting “no” reverses the meaning from not wanting coffee to wanting it.',
  },
  {
    id: 'cosa-casa', category: 'Similar sounds', title: 'Thing or house?',
    prompt: 'Say “house” in Spanish.', expectedText: 'casa', spokenText: 'cosa',
    expectedTranslation: 'house', spokenTranslation: 'thing', expectedCorrect: false,
    note: 'A vowel changes casa (house) into cosa (thing).',
  },
  {
    id: 'casa-control', category: 'Correct control', title: 'A house, correctly',
    prompt: 'Say “house” in Spanish.', expectedText: 'casa', spokenText: 'casa',
    expectedTranslation: 'house', spokenTranslation: 'house', expectedCorrect: true,
    note: 'The spoken word correctly names a house.',
  },
  {
    id: 'trece-treinta', category: 'Changed number', title: 'Thirteen or thirty?',
    prompt: 'Say “thirty” in Spanish.', expectedText: 'treinta', spokenText: 'trece',
    expectedTranslation: 'thirty', spokenTranslation: 'thirteen', expectedCorrect: false,
    note: 'Trece is thirteen, not thirty (treinta).',
  },
  {
    id: 'treinta-control', category: 'Correct control', title: 'Thirty, correctly',
    prompt: 'Say “thirty” in Spanish.', expectedText: 'treinta', spokenText: 'treinta',
    expectedTranslation: 'thirty', spokenTranslation: 'thirty', expectedCorrect: true,
    note: 'The response supplies the requested number, thirty.',
  },
  {
    id: 'negation-control', category: 'Correct control', title: 'No coffee, as requested',
    prompt: 'Say “I don\'t want coffee” in Spanish.', expectedText: 'No quiero café.', spokenText: 'No quiero café.',
    expectedTranslation: "I don't want coffee.", spokenTranslation: "I don't want coffee.", expectedCorrect: true,
    note: 'The response preserves the negation and correctly declines coffee.',
  },
  {
    id: 'past-future', category: 'Changed tense', title: 'Went or going?',
    prompt: 'Say “I went to the market” in Spanish.', expectedText: 'Fui al mercado.', spokenText: 'Voy al mercado.',
    expectedTranslation: 'I went to the market.', spokenTranslation: 'I am going to the market.', expectedCorrect: false,
    note: 'Voy describes going now or in the near future, not a completed trip in the past.',
  },
  {
    id: 'past-tense-control', category: 'Correct control', title: 'A completed trip',
    prompt: 'Say “I went to the market” in Spanish.', expectedText: 'Fui al mercado.', spokenText: 'Fui al mercado.',
    expectedTranslation: 'I went to the market.', spokenTranslation: 'I went to the market.', expectedCorrect: true,
    note: 'Fui expresses the completed past action requested by the drill.',
  },
  {
    id: 'left-right', category: 'Opposite direction', title: 'Left or right?',
    prompt: 'Say “Turn right” in Spanish.', expectedText: 'Gira a la derecha.', spokenText: 'Gira a la izquierda.',
    expectedTranslation: 'Turn right.', spokenTranslation: 'Turn left.', expectedCorrect: false,
    note: 'Izquierda directs the listener left, the opposite of the requested derecha (right).',
  },
  {
    id: 'direction-control', category: 'Correct control', title: 'The right direction',
    prompt: 'Say “Turn right” in Spanish.', expectedText: 'Gira a la derecha.', spokenText: 'Gira a la derecha.',
    expectedTranslation: 'Turn right.', spokenTranslation: 'Turn right.', expectedCorrect: true,
    note: 'The recording gives the requested right-turn instruction.',
  },
  {
    id: 'two-three-tickets', category: 'Changed number', title: 'Two tickets or three?',
    prompt: 'Say “I want two tickets” in Spanish.', expectedText: 'Quiero dos entradas.', spokenText: 'Quiero tres entradas.',
    expectedTranslation: 'I want two tickets.', spokenTranslation: 'I want three tickets.', expectedCorrect: false,
    note: 'The response changes the requested quantity from two to three.',
  },
  {
    id: 'plural-control', category: 'Correct control', title: 'Sleeping cats',
    prompt: 'Say “The cats sleep” in Spanish.', expectedText: 'Los gatos duermen.', spokenText: 'Los gatos duermen.',
    expectedTranslation: 'The cats sleep.', spokenTranslation: 'The cats sleep.', expectedCorrect: true,
    note: 'The plural noun and verb correctly express the requested sentence.',
  },
  {
    id: 'greeting-control', category: 'Correct control', title: 'A good morning',
    prompt: 'Say “Good morning” in Spanish.', expectedText: 'Buenos días.', spokenText: 'Buenos días.',
    expectedTranslation: 'Good morning.', spokenTranslation: 'Good morning.', expectedCorrect: true,
    note: 'The recording provides the standard Spanish morning greeting.',
  },
  {
    id: 'playa-plata-clean', category: 'Similar sounds', title: 'Beach or silver?',
    prompt: 'Say “beach” in Spanish.', expectedText: 'playa', spokenText: 'plata',
    expectedTranslation: 'beach', spokenTranslation: 'silver', expectedCorrect: false,
    note: 'Plata means “silver,” not “beach” (playa); a consonant changes the word.',
  },
  {
    id: 'hunger-thirst-clean', category: 'Changed meaning', title: 'Hungry or thirsty?',
    prompt: 'Say “I am hungry” in Spanish.', expectedText: 'Tengo hambre.', spokenText: 'Tengo sed.',
    expectedTranslation: 'I am hungry.', spokenTranslation: 'I am thirsty.', expectedCorrect: false,
    note: 'Tengo sed expresses thirst, not the requested hunger (tengo hambre).',
  },
  {
    id: 'forty-fourteen-clean', category: 'Changed number', title: 'Forty or fourteen?',
    prompt: 'Say “forty” in Spanish.', expectedText: 'cuarenta', spokenText: 'catorce',
    expectedTranslation: 'forty', spokenTranslation: 'fourteen', expectedCorrect: false,
    note: 'Catorce is fourteen; the requested number is forty (cuarenta).',
  },
  {
    id: 'tomorrow-today-clean', category: 'Changed meaning', title: 'Tomorrow or today?',
    prompt: 'Say “See you tomorrow” in Spanish.', expectedText: 'Nos vemos mañana.', spokenText: 'Nos vemos hoy.',
    expectedTranslation: 'See you tomorrow.', spokenTranslation: 'See you today.', expectedCorrect: false,
    note: 'Hoy changes the meeting time to today rather than tomorrow (mañana).',
  },
  {
    id: 'hot-cold-clean', category: 'Opposite meaning', title: 'Hot or cold?',
    prompt: 'Say “It is hot” in Spanish, describing the temperature of an object.', expectedText: 'Está caliente.', spokenText: 'Está frío.',
    expectedTranslation: 'It is hot.', spokenTranslation: 'It is cold.', expectedCorrect: false,
    note: 'Está frío describes a cold object, the opposite of the requested está caliente.',
  },
  {
    id: 'water-control-clean', category: 'Correct control', title: 'Water, correctly',
    prompt: 'Say “water” in Spanish.', expectedText: 'agua', spokenText: 'agua',
    expectedTranslation: 'water', spokenTranslation: 'water', expectedCorrect: true,
    note: 'Agua is the requested Spanish word for water.',
  },
  {
    id: 'station-control-clean', category: 'Correct control', title: 'A nearby station',
    prompt: 'Say “The station is nearby” in Spanish.', expectedText: 'La estación está cerca.', spokenText: 'La estación está cerca.',
    expectedTranslation: 'The station is nearby.', spokenTranslation: 'The station is nearby.', expectedCorrect: true,
    note: 'The response correctly says that the station is nearby.',
  },
  {
    id: 'meat-negation-control-clean', category: 'Correct control', title: 'No meat, as requested',
    prompt: 'Say “I do not eat meat” in Spanish.', expectedText: 'No como carne.', spokenText: 'No como carne.',
    expectedTranslation: 'I do not eat meat.', spokenTranslation: 'I do not eat meat.', expectedCorrect: true,
    note: 'No preserves the requested negation: the speaker does not eat meat.',
  },
  {
    id: 'twenty-euros-control-clean', category: 'Correct control', title: 'A twenty-euro price',
    prompt: 'Say “It costs twenty euros” in Spanish.', expectedText: 'Cuesta veinte euros.', spokenText: 'Cuesta veinte euros.',
    expectedTranslation: 'It costs twenty euros.', spokenTranslation: 'It costs twenty euros.', expectedCorrect: true,
    note: 'The response gives the requested price of twenty euros.',
  },
  {
    id: 'bathroom-control-clean', category: 'Correct control', title: 'Finding the bathroom',
    prompt: 'Say “Where is the bathroom?” in Spanish.', expectedText: '¿Dónde está el baño?', spokenText: '¿Dónde está el baño?',
    expectedTranslation: 'Where is the bathroom?', spokenTranslation: 'Where is the bathroom?', expectedCorrect: true,
    note: 'The response correctly asks where the bathroom is.',
  },
  {
    id: 'peso-beso', category: 'Similar sounds', title: 'Weight or kiss?',
    prompt: 'Say “weight” in Spanish.', expectedText: 'peso', spokenText: 'beso',
    expectedTranslation: 'weight', spokenTranslation: 'kiss', expectedCorrect: false,
    note: 'Changing the initial consonant from p to b changes peso (weight) into beso (kiss).',
  },
  {
    id: 'pata-bata', category: 'Similar sounds', title: 'An animal’s leg or robe?',
    prompt: 'Say “an animal’s leg” in Spanish, using “pata”.', expectedText: 'pata', spokenText: 'bata',
    expectedTranslation: 'an animal’s leg', spokenTranslation: 'robe', expectedCorrect: false,
    note: 'The initial consonant distinguishes pata (an animal’s leg) from bata (robe).',
  },
  {
    id: 'pala-bala', category: 'Similar sounds', title: 'Shovel or bullet?',
    prompt: 'Say “shovel” in Spanish.', expectedText: 'pala', spokenText: 'bala',
    expectedTranslation: 'shovel', spokenTranslation: 'bullet', expectedCorrect: false,
    note: 'An initial b instead of p changes pala (shovel) into bala (bullet).',
  },
  {
    id: 'jamon-jabon', category: 'Similar sounds', title: 'Ham or soap?',
    prompt: 'Say “ham” in Spanish.', expectedText: 'jamón', spokenText: 'jabón',
    expectedTranslation: 'ham', spokenTranslation: 'soap', expectedCorrect: false,
    note: 'The middle consonant changes jamón (ham) into jabón (soap); both stress the final syllable.',
  },
  {
    id: 'pino-vino', category: 'Similar sounds', title: 'Pine tree or wine?',
    prompt: 'Say “pine tree” in Spanish.', expectedText: 'pino', spokenText: 'vino',
    expectedTranslation: 'pine tree', spokenTranslation: 'wine', expectedCorrect: false,
    note: 'The initial p in pino (pine tree) differs from the b sound written v in vino (wine).',
  },
  {
    id: 'pelo-pero', category: 'Similar sounds', title: 'Hair or but?',
    prompt: 'Say “hair” in Spanish.', expectedText: 'pelo', spokenText: 'pero',
    expectedTranslation: 'hair', spokenTranslation: 'but', expectedCorrect: false,
    note: 'Replacing l with a tapped r changes pelo (hair) into pero (but).',
  },
  {
    id: 'loma-lona', category: 'Similar sounds', title: 'Hill or canvas?',
    prompt: 'Say “hill” in Spanish, using “loma”.', expectedText: 'loma', spokenText: 'lona',
    expectedTranslation: 'hill', spokenTranslation: 'canvas', expectedCorrect: false,
    note: 'The nasal consonant changes loma (hill) into lona (canvas): m becomes n.',
  },
  {
    id: 'lago-lado', category: 'Similar sounds', title: 'Lake or side?',
    prompt: 'Say “lake” in Spanish.', expectedText: 'lago', spokenText: 'lado',
    expectedTranslation: 'lake', spokenTranslation: 'side', expectedCorrect: false,
    note: 'The middle consonant distinguishes lago (lake) from lado (side).',
  },
  {
    id: 'manga-mango', category: 'Similar sounds', title: 'Sleeve or mango?',
    prompt: 'Say “sleeve” in Spanish.', expectedText: 'manga', spokenText: 'mango',
    expectedTranslation: 'sleeve', spokenTranslation: 'mango', expectedCorrect: false,
    note: 'Changing the final vowel from a to o changes manga (sleeve) into mango (the fruit).',
  },
  {
    id: 'boca-poca', category: 'Similar sounds', title: 'Mouth or little?',
    prompt: 'Say “mouth” in Spanish.', expectedText: 'boca', spokenText: 'poca',
    expectedTranslation: 'mouth', spokenTranslation: 'little (feminine)', expectedCorrect: false,
    note: 'The initial consonant changes boca (mouth) into poca, the feminine form of “little.”',
  },
  {
    id: 'hambre-hombre', category: 'Similar sounds', title: 'Hunger or man?',
    prompt: 'Say “hunger” in Spanish.', expectedText: 'hambre', spokenText: 'hombre',
    expectedTranslation: 'hunger', spokenTranslation: 'man', expectedCorrect: false,
    note: 'The first vowel distinguishes hambre (hunger) from hombre (man).',
  },
  {
    id: 'oveja-abeja', category: 'Similar sounds', title: 'Sheep or bee?',
    prompt: 'Say “sheep” in Spanish.', expectedText: 'oveja', spokenText: 'abeja',
    expectedTranslation: 'sheep', spokenTranslation: 'bee', expectedCorrect: false,
    note: 'The first vowel changes oveja (sheep) into abeja (bee); Spanish b and v represent the same consonant phoneme.',
  },
];

const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!['--audio-only', '--judge-only', '--force-audio'].includes(flag) && !flag.startsWith('--only=')) throw new Error(`Unknown option: ${flag}`);
}
if (flags.has('--audio-only') && flags.has('--judge-only')) throw new Error('Choose either --audio-only or --judge-only, not both.');
if (flags.has('--judge-only') && flags.has('--force-audio')) throw new Error('--force-audio cannot be used with --judge-only.');
const generateAudio = !flags.has('--judge-only');
const judgeAudio = !flags.has('--audio-only');
const selectedIds = [...flags].filter(flag => flag.startsWith('--only=')).map(flag => flag.slice('--only='.length));
for (const id of selectedIds) {
  if (!cases.some(example => example.id === id)) throw new Error(`Unknown example ID: ${id}`);
}

async function readOptional(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function persist(dataset) {
  const temporary = `${dataPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(dataset, null, 2)}\n`);
  await rename(temporary, dataPath);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function audioStream(apiKey, text, format) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: generationModel,
      modalities: ['text', 'audio'],
      audio: { voice, format },
      stream: true,
      messages: [
        { role: 'system', content: 'You are a text-to-speech engine, not a conversational assistant. Read only the Spanish text inside <speech> tags, verbatim. Do not acknowledge the request, answer it, translate it, or add any other words.' },
        { role: 'user', content: `Read this Spanish text aloud, and output nothing else:\n<speech>${text}</speech>` },
      ],
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`OpenRouter HTTP ${response.status}: ${message}`);
    error.streamingFormatRestriction = response.status === 400 && /pcm16/i.test(message) && /stream/i.test(message);
    throw error;
  }
  if (!response.body) throw new Error('OpenRouter returned no response stream.');
  const buffers = [];
  let transcript = '';
  let pending = '';
  const decoder = new TextDecoder();
  function consume(event) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data);
    if (chunk.error) {
      const message = JSON.stringify(chunk.error);
      const error = new Error(`OpenRouter stream error: ${message}`);
      error.streamingFormatRestriction = /pcm16/i.test(message) && /stream/i.test(message);
      throw error;
    }
    for (const choice of chunk.choices ?? []) {
      if (choice.error) throw new Error(`OpenRouter choice error: ${JSON.stringify(choice.error)}`);
      const audio = choice.delta?.audio;
      if (audio?.data) buffers.push(Buffer.from(audio.data, 'base64'));
      if (audio?.transcript) transcript += audio.transcript;
    }
  }
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(pending))) {
      consume(pending.slice(0, boundary.index));
      pending = pending.slice(boundary.index + boundary[0].length);
    }
  }
  pending += decoder.decode();
  if (pending.trim()) consume(pending);
  const bytes = Buffer.concat(buffers);
  if (!bytes.length) throw new Error('OpenRouter returned no audio bytes.');
  return { bytes, transcript, format };
}

function mediaCommand(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`${binary} is required: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

async function createAudio(example, apiKey) {
  let generated;
  try { generated = await audioStream(apiKey, example.spokenText, 'mp3'); }
  catch (error) {
    if (!error.streamingFormatRestriction) throw error;
    console.log(`${example.id}: provider requires pcm16 for streaming; converting 24 kHz mono PCM to MP3.`);
    generated = await audioStream(apiKey, example.spokenText, 'pcm16');
  }
  const words = text => text.normalize('NFC').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (words(generated.transcript) !== words(example.spokenText)) {
    throw new Error(`${example.id}: provider transcript differs from the requested words: ${JSON.stringify(generated.transcript)}. Existing audio was not replaced.`);
  }
  const rawPath = path.join(audioDir, `.${example.id}.source.${generated.format}`);
  const encodedPath = path.join(audioDir, `.${example.id}.encoded.mp3`);
  const finalPath = path.join(audioDir, `${example.id}.mp3`);
  try {
    await writeFile(rawPath, generated.bytes);
    if (generated.format === 'pcm16') {
      mediaCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', rawPath, '-codec:a', 'libmp3lame', '-q:a', '2', encodedPath]);
    } else {
      const format = JSON.parse(mediaCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name', '-of', 'json', rawPath]));
      if (format.format?.format_name === 'mp3') await rename(rawPath, encodedPath);
      else mediaCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawPath, '-codec:a', 'libmp3lame', '-q:a', '2', encodedPath]);
    }
    const info = JSON.parse(mediaCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type', '-of', 'json', encodedPath]));
    if (!info.streams?.some(stream => stream.codec_type === 'audio' && stream.codec_name === 'mp3') || !(Number(info.format?.duration) > 0)) {
      throw new Error(`Generated recording for ${example.id} is not playable MP3 audio.`);
    }
    const bytes = await readFile(encodedPath);
    await rename(encodedPath, finalPath);
    return {
      src: `/audio/${example.id}.mp3`, model: generationModel, voice,
      generatedAt: new Date().toISOString(), sha256: sha256(bytes),
      transcript: generated.transcript, sourceFormat: generated.format,
      durationSeconds: Number(info.format.duration),
    };
  } finally {
    await Promise.all([rawPath, encodedPath].map(file => unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; })));
  }
}

async function readSavedAudio(example) {
  let bytes;
  try { bytes = await readFile(path.join(audioDir, `${example.id}.mp3`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (bytes && !example.audio) throw new Error(`${example.id}: existing recording has no provenance metadata; refusing to overwrite it. Move it aside explicitly before generating.`);
  if (bytes && sha256(bytes) !== example.audio.sha256) throw new Error(`${example.id}: recording hash differs from saved provenance; refusing to reuse or overwrite it.`);
  return bytes;
}

async function judge(example, bytes) {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('Judging requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_AUTH_TOKEN). Audio generation results have been saved.');
  const request = {
    model: 'clef-omni',
    state: `This is a Spanish language drill. Drill: ${example.prompt}\nExpected response: ${example.expectedText}\nGrade correctness from the actual recording, not from the expected response alone.`,
    questions: {
      is_correct: {
        type: 'noul',
        instructions: 'Does the spoken Spanish response correctly answer the drill? Judge the actual audio. Reject different words, changed numbers, or missing negation; tolerate natural accent variation.',
      },
    },
  };
  const started = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${judgmentModel}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, audio: [`data:audio/mpeg;base64,${bytes.toString('base64')}`] }),
  });
  const body = await response.json();
  const elapsedMs = Math.round(performance.now() - started);
  if (!response.ok || body.success === false) throw new Error(`Cloudflare judgment failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`);
  const result = body.result;
  const answer = result?.answers?.is_correct;
  const probabilityCorrect = answer?.noul;
  if (answer?.type !== 'noul' || typeof probabilityCorrect !== 'number' || !Number.isFinite(probabilityCorrect) || probabilityCorrect < 0 || probabilityCorrect > 1) {
    throw new Error(`Cloudflare returned an invalid is_correct probability: ${JSON.stringify(result)}`);
  }
  return {
    probabilityCorrect, isCorrect: probabilityCorrect >= threshold, elapsedMs,
    judgedAt: new Date().toISOString(), model: judgmentModel, request, response: result,
  };
}

async function main() {
  const isSelected = example => !selectedIds.length || selectedIds.includes(example.id);
  const existingText = await readOptional(dataPath);
  const existing = existingText ? JSON.parse(existingText) : null;
  const examples = cases.map(seed => {
    const previous = existing?.examples?.find(example => example.id === seed.id);
    return previous ?? { ...seed, audio: null, judgment: null };
  });
  const dataset = { version: 1, model: judgmentModel, threshold, examples };
  await mkdir(path.dirname(dataPath), { recursive: true });
  await mkdir(audioDir, { recursive: true });
  await persist(dataset);
  let apiKey;
  for (const example of examples) {
    if (!isSelected(example)) continue;
    const audioPath = path.join(audioDir, `${example.id}.mp3`);
    let bytes = await readSavedAudio(example);
    if (generateAudio && (!bytes || flags.has('--force-audio'))) {
      if (!apiKey) {
        apiKey = (process.env.OPENROUTER_API_KEY || await readOptional(path.join(root, '.openrouter-api-key')) || '').trim();
        if (!apiKey) throw new Error('Set OPENROUTER_API_KEY or provide .openrouter-api-key.');
      }
      example.audio = await createAudio(example, apiKey);
      example.judgment = null;
      await persist(dataset);
      bytes = await readFile(audioPath);
      console.log(`${example.id}: saved ${bytes.length} audio bytes.`);
    } else if (bytes) console.log(`${example.id}: reusing saved audio.`);
    if (judgeAudio) {
      if (!bytes || !example.audio) throw new Error(`${example.id}: missing recording; run --audio-only first.`);
      if (!example.judgment) {
        example.judgment = await judge(example, bytes);
        await persist(dataset);
        console.log(`${example.id}: probability correct ${example.judgment.probabilityCorrect}.`);
      } else console.log(`${example.id}: reusing saved judgment.`);
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
