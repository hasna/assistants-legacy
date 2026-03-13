import type { Command } from './types';

/**
 * /voice - Toggle voice mode or show status
 */
export function voiceCommand(): Command {
  return {
    name: 'voice',
    description: 'Toggle voice mode, check status, or stop audio (on/off/status/stop)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      if (!context.getVoiceState) {
        context.emit('text', 'Voice support is not available in this build.\n');
        context.emit('done');
        return { handled: true };
      }

      const trimmed = args.trim().toLowerCase();
      if (trimmed === 'on') {
        context.enableVoice?.();
        context.emit('text', 'Voice mode enabled.\n');
        context.emit('done');
        return { handled: true };
      }
      if (trimmed === 'off') {
        context.disableVoice?.();
        context.emit('text', 'Voice mode disabled.\n');
        context.emit('done');
        return { handled: true };
      }
      if (trimmed === 'stop') {
        context.stopSpeaking?.();
        context.stopListening?.();
        context.stopTalking?.();
        context.emit('text', 'Voice output/input stopped.\n');
        context.emit('done');
        return { handled: true };
      }

      const state = context.getVoiceState();
      if (!state) {
        context.emit('text', 'Voice support is not available.\n');
        context.emit('done');
        return { handled: true };
      }
      context.emit('text', '\n## Voice Mode\n\nSpeak and listen using text-to-speech and speech-to-text.\n\n');
      context.emit('text', '**Subcommands:** `/voice on` · `/voice off` · `/voice stop` · `/voice` (status)\n\nUse `/talk` to start a live voice conversation.\n\n');
      const status = state.enabled ? 'on' : 'off';
      const activity = state.isSpeaking ? 'speaking' : state.isListening ? 'listening' : 'idle';
      context.emit('text', `Voice mode: ${status} (${activity})\n`);
      if (state.sttProvider || state.ttsProvider) {
        context.emit('text', `STT: ${state.sttProvider || 'unknown'} · TTS: ${state.ttsProvider || 'unknown'}\n`);
      }
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /talk - Start live voice conversation
 * Args: --no-autosend (require Enter to send), --autosend (auto-send on silence)
 */
export function talkCommand(): Command {
  return {
    name: 'talk',
    description: 'Start live voice conversation. Args: --autosend (default), --no-autosend (press Enter to send)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      if (!context.talk || !context.processForTalk) {
        context.emit('text', 'Voice support is not available.\n');
        context.emit('done');
        return { handled: true };
      }

      // Parse args for auto-send toggle
      const trimmedArgs = args.trim().toLowerCase();
      if (trimmedArgs === '--no-autosend' || trimmedArgs === '--manual') {
        context.setAutoSend?.(false);
      } else if (trimmedArgs === '--autosend' || trimmedArgs === '--auto') {
        context.setAutoSend?.(true);
      }

      const autoSend = context.getAutoSend?.() !== false;
      const sendMode = autoSend
        ? 'Speak naturally — silence auto-sends your message.'
        : 'Speak, then press Enter to send. Use --autosend to switch.';

      context.emit('text', `\n## Talk Mode\n\nLive conversation started. ${sendMode}\nType /stop or press Ctrl+C to exit.\n\n`);

      // Track the last partial transcript for the live display
      let lastPartial = '';

      try {
        await context.talk({
          onPartialTranscript: (text) => {
            // Emit a special event for the terminal to update the input box live
            // Clear previous partial and show new one
            if (text !== lastPartial) {
              lastPartial = text;
              context.emit('partial_transcript', text);
            }
          },
          onTranscript: (text) => {
            lastPartial = '';
            context.emit('partial_transcript', ''); // Clear partial
            context.emit('text', `**You:** ${text}\n\n`);
          },
          onResponse: () => {
            // Response is already streamed to chat by the normal process flow
          },
          sendMessage: async (text) => {
            return context.processForTalk!(text);
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg !== 'Talk mode stopped') {
          context.emit('error', msg);
        }
      }

      context.emit('text', '\nTalk mode ended.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
