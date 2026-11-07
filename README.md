# Spanish audio examples

A completely static, 38-example Spanish audio judgment challenge set, inspired by [Audio Judgment Models Are Jagged](https://camden.sh/posts/audio-decision-models/).

The page contains a plain list of playable examples, a JSON download button, and a short first-person explanation of the Spanish flashcard experiment. Each example shows the expected and spoken text, translations, a compact Expected / Judged / Probability row, and a badge indicating whether the model matched the reference judgment. All / Matches / Mistakes filters select examples by agreement with the reference, not whether the spoken answer itself was correct. There is no dashboard, branding, or per-example metadata panel.

- Speech: `openai/gpt-audio-mini` and `openai/gpt-audio` through OpenRouter, voice `alloy`; the exact model is recorded per clip.
- Judgments: `@cf/cloudflare/clef-omni` through Cloudflare Workers AI.
- Hosting: Cloudflare Workers Static Assets. Only `public/` is uploaded; there is no application Worker, runtime inference, microphone capture, or browser credential.

## Run and deploy

Requires Node.js 22+.

```sh
npm ci
npm run dev
npm run build                 # Cloudflare deployment dry run
npx wrangler login
npm run deploy
```

`wrangler.jsonc` selects the account and site name. Change these when deploying to another account. The site works on any static host serving `public/` at the domain root; Cloudflare applies its `_headers` security policy.

## Generate audio and judge it

Also requires `ffmpeg` and `ffprobe` on PATH, an OpenRouter key, and Cloudflare Workers AI access. Generation and inference make paid API calls; loading the published site does not.

Put the OpenRouter key in the gitignored `.openrouter-api-key`, or set `OPENROUTER_API_KEY`. Never put credentials in `public/`.

```sh
npm run generate:audio
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export CLOUDFLARE_API_TOKEN=your_workers_ai_token
npm run judge
```

`CLOUDFLARE_AUTH_TOKEN` is also accepted. A Wrangler browser login authenticates deployment but does not automatically supply a token to the generation script.

`npm run generate` performs both stages. Existing recordings and judgments are reused, and completed results are saved incrementally. OpenRouter streaming requires PCM16; the script converts the resulting 24 kHz mono speech to MP3 and checks the provider transcript against the requested words. A mismatch stops generation rather than publishing additional spoken framing.

The default speech model is `openai/gpt-audio-mini`. Set `OPENROUTER_AUDIO_MODEL=openai/gpt-audio` to use the larger model. All twelve recent sound-confusion clips use the larger model. The published recordings were checked with a separate transcription model; this is not human pronunciation validation. Invalid or ambiguous synthesis is replaced before judging, not selected according to Clef's result.

```sh
# Explicitly replace one recording and invalidate its previous judgment:
node scripts/generate.mjs --audio-only --force-audio --only=dropped-negation
node scripts/generate.mjs --judge-only --only=dropped-negation
```

Add cases to `cases` in `scripts/generate.mjs`. Each case needs a unique ID, prompt, expected response, generated speech script, translations, reference grade, and explanation. Treat published case IDs as immutable: a different utterance or drill should get a new ID rather than reusing old evidence. Regenerate and rejudge before deploying changed audio.

## What the results mean

The 38 cases include thirteen correct and twenty-five deliberately incorrect responses. Twenty-six earlier speech recordings are supplemented by twelve deliberately incorrect phonetic near-misses covering consonants and vowels. Stress-only and single-versus-double-r cases, including their double-r controls, are excluded; all retained audio and judgments are unchanged. This is a curated challenge set, not a random or representative sample and not a general accuracy estimate. The displayed spoken text is the generation script, not an independent human transcript.

For each judgment, Cloudflare receives the actual MP3, drill prompt, expected response, and grading question. It does **not** receive the generated speech script, its transcript, the reference grade, or the explanation. `P(correct) >= 0.5` produces a “Correct” grade. A model mistake means that grade disagrees with the reference; a successful judgment can correctly reject an incorrect answer.

`public/data/examples.json` preserves the probability, timestamp, raw model result, request text/schema, audio SHA-256, and speech provenance. Request timing is observed wall time including network overhead, not isolated model latency. The recording is sent as embedded audio during generation; its base64 payload is omitted from the saved request because the corresponding MP3 is published separately. Full requests, responses, and provenance are available in the JSON download rather than displayed on the page.

## Sound-confusion cases

The recent set includes consonant contrasts (peso/beso, pata/bata, pala/bala, jamón/jabón, pino/vino, pelo/pero, loma/lona, lago/lado, boca/poca) and vowel contrasts (manga/mango, hambre/hombre, oveja/abeja).

Stress placement alone and single-versus-double-r distinctions are intentionally outside this benchmark's error criteria. Stress-only pairs and double-r cases, including their associated controls, are removed. The retained challenges focus on other vowel and consonant differences; pelo/pero remains because it contrasts l with r rather than a single r with rr.

Pairs that become homophones in common Spanish dialects—such as casa/caza, tubo/tuvo, or pollo/poyo—are not used as incorrect audio-only cases. In oveja/abeja the contrast is the first vowel, not the spelling difference between v and b. The retained `*-clean` IDs remain stable ordinary examples; there is no noise generator, noise metadata, or noise-condition UI.

Every recent recording deliberately says the wrong member of its pair. Existing correct responses remain as controls. All twelve cases in this subset are kept regardless of the model's judgment; none are filtered out for being easy or hard for Clef.

