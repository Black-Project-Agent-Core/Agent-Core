import { fileCheckpointService } from '../checkpoints/service.js';
import type { ServerResult } from '../types.js';

export async function handleFileCheckpoint(args: any): Promise<ServerResult> {
  try {
    let result: unknown;
    switch (args.action) {
      case 'create':
        result = await fileCheckpointService.create(args.paths ?? [], args.title);
        break;
      case 'list':
        result = await fileCheckpointService.list();
        break;
      case 'show':
        result = await fileCheckpointService.show(args.checkpointId);
        break;
      case 'preview_restore':
        result = await fileCheckpointService.previewRestore(args.checkpointId);
        break;
      case 'restore':
        result = await fileCheckpointService.restore(args.checkpointId, args.previewDigest);
        break;
      case 'drop':
        result = await fileCheckpointService.drop(args.checkpointId);
        break;
      default:
        throw new Error('CHECKPOINT_ACTION_UNSUPPORTED');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result as Record<string, unknown>,
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : String(error)) }],
      isError: true,
    };
  }
}
