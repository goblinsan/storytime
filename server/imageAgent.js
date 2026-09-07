/**
 * Asking a picture of somebody, and getting one back.
 *
 * The same shape as a canon request: a draft is filed, something answers it,
 * and what comes back is a proposal a person accepts or sends back. Only the
 * answer differs -- images rather than sentences -- so the queue, the polling,
 * the revision loop and the review are the ones that already exist.
 *
 * WHAT IT PRODUCES
 * URLs on the ComfyUI that made them. That is deliberate for now and it is not
 * permanent: the files live in that server's output folder and will be moved to
 * network storage later. Nothing here writes to the machine running the app,
 * which is the rule that matters most.
 */
import { env } from './env.js';

export const IMAGE_REQUEST = 'character_image_request';

/** How long a picture may take before we stop waiting for it. */
const GENERATE_TIMEOUT_MS = Number(env('IMAGE_TIMEOUT_MS') ?? 180_000);

/**
 * What the picture is of, in the words the canon uses.
 *
 * Appearance leads and, when it is written, the history stays out entirely. It
 * used to be the other way round because appearance had no field of its own:
 * Malakor's says "smooth dark faceless angular helm, glowing blue eye-slits"
 * three sentences into a paragraph about Oakhaven falling, so the whole
 * paragraph went in and the model drew plate armour and a visible face. A
 * history is a story about somebody; only some of it is on the outside of them.
 */
export function buildImagePrompt({ character, style, note, previousPrompt }) {
  const appearance = String(character.appearance ?? '').trim();
  const subject = [
    `${character.name}${character.role ? `, ${character.role}` : ''}.`,
    appearance,
    // Fallback only. The history is mostly events, and events are not a face.
    appearance ? '' : String(character.background ?? '').replace(/\s+/g, ' ').trim(),
  ].filter(Boolean).join(' ');

  const positive = [
    // The style leads, because it is the thing every picture of this work has
    // in common and the thing a model weights most heavily at the front.
    style?.trim(),
    'single character portrait,',
    subject,
    note?.trim() ? `Emphasise: ${note.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive: positive.slice(0, 1800),
    previousPrompt: previousPrompt ?? null,
  };
}

/**
 * A plain SDXL text-to-image graph, in ComfyUI's prompt format.
 *
 * Written out rather than loaded from a saved workflow file: a workflow export
 * carries the editor's own layout and node ids, and drifts the moment somebody
 * opens it. Seven nodes is small enough to say plainly.
 */
export function sdxlWorkflow({ model, positive, negative, options = {}, seed }) {
  const {
    steps = 30, cfg = 5.5, width = 1024, height = 1024,
    sampler = 'dpmpp_2m', scheduler = 'karras', batch = 2,
  } = options;

  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: negative ?? '', clip: ['1', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: batch } },
    5: {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    7: { class_type: 'SaveImage', inputs: { filename_prefix: 'contesora', images: ['6', 0] } },
  };
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Queue a graph and wait for the pictures.
 *
 * ComfyUI answers the POST with a prompt id and does the work afterwards, so
 * the result has to be collected by asking. Polling its history is the whole
 * protocol; there is no callback to register.
 */
export async function generateWithComfy({ endpoint, model, positive, negative, options, seed }) {
  const base = String(endpoint).replace(/\/+$/, '');
  const workflow = sdxlWorkflow({ model, positive, negative, options, seed });

  const queued = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'contesora' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!queued.ok) {
    const said = await queued.text();
    // ComfyUI reports a bad graph here in full, and it is the only place it
    // says which node it disliked.
    throw new Error(`ComfyUI refused the graph (${queued.status}): ${said.slice(0, 400)}`);
  }
  const { prompt_id: promptId } = await queued.json();
  if (!promptId) throw new Error('ComfyUI accepted the graph but named no prompt');

  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`no images after ${Math.round(GENERATE_TIMEOUT_MS / 1000)}s`);
    }
    await sleep(2000);
    const res = await fetch(`${base}/history/${promptId}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) continue;
    const history = await res.json();
    const entry = history?.[promptId];
    if (!entry) continue;

    const status = entry.status?.status_str;
    if (status === 'error') {
      const messages = (entry.status?.messages ?? [])
        .filter(([kind]) => kind === 'execution_error')
        .map(([, detail]) => detail?.exception_message)
        .filter(Boolean);
      throw new Error(`ComfyUI failed: ${messages.join('; ') || 'no reason given'}`);
    }

    const images = Object.values(entry.outputs ?? {})
      .flatMap((output) => output.images ?? [])
      .filter((image) => image.type === 'output');
    if (!images.length) continue;

    return images.map((image) => {
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type,
      });
      return `${base}/view?${query}`;
    });
  }
}
