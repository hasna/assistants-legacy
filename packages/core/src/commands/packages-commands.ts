import type { Command } from './types';
import { PackageInstaller } from '../packages/installer';

/**
 * /install - Install a package from npm or git
 */
export function installCommand(): Command {
  return {
    name: 'install',
    description: 'Install a package (npm:@foo/tools or git:github.com/user/repo)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const tokens = args.trim().split(/\s+/);
      const source = tokens[0];

      if (!source) {
        context.emit('text', 'Usage: /install <source> [--local]\n');
        context.emit('text', '\nExamples:\n');
        context.emit('text', '  /install npm:@foo/tools\n');
        context.emit('text', '  /install git:github.com/user/repo\n');
        context.emit('text', '  /install some-npm-package --local\n');
        context.emit('done');
        return { handled: true };
      }

      const local = tokens.includes('--local') || tokens.includes('-l');

      try {
        context.emit('text', `\nInstalling ${source}...\n`);
        const result = await PackageInstaller.installPackage(source, { local });
        context.emit('text', `Installed "${result.name}" (${result.source}, v${result.version})\n`);
        context.emit('text', `Location: ${result.path}\n`);
        context.emit('text', `Scope: ${local ? 'local' : 'global'}\n`);
      } catch (error) {
        context.emit('text', `Failed to install: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /remove - Remove an installed package
 */
export function removeCommand(): Command {
  return {
    name: 'remove',
    aliases: ['uninstall'],
    description: 'Remove an installed package',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const tokens = args.trim().split(/\s+/);
      const name = tokens[0];

      if (!name) {
        context.emit('text', 'Usage: /remove <package-name> [--local]\n');
        context.emit('done');
        return { handled: true };
      }

      const local = tokens.includes('--local') || tokens.includes('-l');

      try {
        await PackageInstaller.removePackage(name, { local });
        context.emit('text', `\nRemoved "${name}" from ${local ? 'local' : 'global'} packages.\n`);
      } catch (error) {
        context.emit('text', `Failed to remove: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /packages - List installed packages
 */
export function packagesCommand(): Command {
  return {
    name: 'packages',
    description: 'List installed packages',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = tokens[0];

      // /packages update [--local]
      if (subcommand === 'update') {
        const local = tokens.includes('--local') || tokens.includes('-l');
        try {
          context.emit('text', `\nUpdating ${local ? 'local' : 'global'} packages...\n`);
          const result = await PackageInstaller.updatePackages({ local });
          if (result.updated.length > 0) {
            context.emit('text', `Updated: ${result.updated.join(', ')}\n`);
          }
          if (result.errors.length > 0) {
            for (const err of result.errors) {
              context.emit('text', `Error: ${err}\n`);
            }
          }
          if (result.updated.length === 0 && result.errors.length === 0) {
            context.emit('text', 'No packages to update.\n');
          }
        } catch (error) {
          context.emit('text', `Failed to update: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /packages [list] — default: list all packages
      const lines: string[] = ['\n**Installed packages:**\n'];

      for (const scope of ['global', 'local'] as const) {
        const isLocal = scope === 'local';
        try {
          const packages = await PackageInstaller.listPackages({ local: isLocal });
          if (packages.length > 0) {
            lines.push(`\n_${scope} (${isLocal ? '.assistants/packages/' : '~/.hasna/assistants/packages/'})_`);
            for (const pkg of packages) {
              lines.push(`  ${pkg.name} (${pkg.source}) v${pkg.version}`);
            }
          }
        } catch {
          // Skip scope if error
        }
      }

      if (lines.length === 1) {
        lines.push('No packages installed.');
        lines.push('\nUse /install <source> to install a package.');
      }

      context.emit('text', lines.join('\n') + '\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
