import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { TableTestCase } from './parser';
import { Logger } from './logger';

export class TestRunner {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Go Table Tests');
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('goTableTests');
    }

    private getGoConfig(uri: vscode.Uri): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('go', uri);
    }

    private expandHomePath(value: string): string {
        if (!value) {
            return value;
        }
        if (value === '~') {
            return os.homedir();
        }
        if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
            return path.join(os.homedir(), value.slice(2));
        }
        return value;
    }

    private isExecutableFile(filePath: string): boolean {
        try {
            const stat = fs.statSync(filePath);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    private findExecutableInPath(commandName: string): string | null {
        const pathValue = process.env.PATH ?? '';
        const pathExtValue = process.env.PATHEXT ?? '';
        const pathParts = pathValue.split(path.delimiter).filter(Boolean);

        const isWindows = process.platform === 'win32';
        const hasExt = path.extname(commandName).length > 0;
        const extensions = isWindows && !hasExt
            ? pathExtValue.split(';').filter(Boolean)
            : [''];

        for (const dir of pathParts) {
            for (const ext of extensions) {
                const candidate = path.join(dir, `${commandName}${ext}`);
                if (this.isExecutableFile(candidate)) {
                    return candidate;
                }
            }

            if (isWindows && hasExt) {
                const candidate = path.join(dir, commandName);
                if (this.isExecutableFile(candidate)) {
                    return candidate;
                }
            }
        }

        return null;
    }

    private resolveGoExecutable(uri: vscode.Uri): string {
        const goConfig = this.getGoConfig(uri);
        const isWindows = process.platform === 'win32';
        const goExeName = isWindows ? 'go.exe' : 'go';

        const alternateTools = goConfig.get<unknown>('alternateTools', undefined) as Record<string, unknown> | undefined;
        const altGo = alternateTools?.go;
        if (typeof altGo === 'string' && altGo.trim().length > 0) {
            const expanded = this.expandHomePath(altGo.trim());
            const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
            if (this.isExecutableFile(candidate)) {
                return candidate;
            }
        }

        const goroot = goConfig.get<unknown>('goroot', '');
        if (typeof goroot === 'string' && goroot.trim().length > 0) {
            const expanded = this.expandHomePath(goroot.trim());
            const candidate = path.join(expanded, 'bin', goExeName);
            if (this.isExecutableFile(candidate)) {
                return candidate;
            }
        }

        const fromPath = this.findExecutableInPath(isWindows ? 'go.exe' : 'go');
        if (fromPath) {
            return fromPath;
        }

        throw new Error('Go executable not found. Ensure Go is installed and available in PATH, or set go.alternateTools.go / go.goroot.');
    }

    private getStringArraySetting(uri: vscode.Uri, section: string, defaultValue: string[] = []): string[] {
        const value = this.getGoConfig(uri).get<unknown>(section, defaultValue);
        if (Array.isArray(value)) {
            return value.filter((v): v is string => typeof v === 'string');
        }
        if (typeof value === 'string') {
            return this.splitCommandLine(value);
        }
        return defaultValue;
    }

    private getStringSetting(uri: vscode.Uri, section: string, defaultValue = ''): string {
        const value = this.getGoConfig(uri).get<unknown>(section, defaultValue);
        return typeof value === 'string' ? value.trim() : defaultValue;
    }

    private splitCommandLine(value: string): string[] {
        const args: string[] = [];
        let current = '';
        let quote: '"' | "'" | null = null;

        for (let i = 0; i < value.length; i++) {
            const ch = value[i];

            if (quote) {
                if (ch === '\\' && i + 1 < value.length) {
                    current += value[i + 1];
                    i++;
                    continue;
                }
                if (ch === quote) {
                    quote = null;
                    continue;
                }
                current += ch;
                continue;
            }

            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }

            if (/\s/.test(ch)) {
                if (current.length > 0) {
                    args.push(current);
                    current = '';
                }
                continue;
            }

            if (ch === '\\' && i + 1 < value.length) {
                current += value[i + 1];
                i++;
                continue;
            }

            current += ch;
        }

        if (current.length > 0) {
            args.push(current);
        }

        return args;
    }

    private getGoTestFlags(uri: vscode.Uri): string[] {
        return this.getStringArraySetting(uri, 'testFlags', []);
    }

    private getGoBuildFlags(uri: vscode.Uri): string[] {
        return this.getStringArraySetting(uri, 'buildFlags', []);
    }

    private getGoTestTags(uri: vscode.Uri): string {
        return this.getStringSetting(uri, 'testTags', '');
    }

    private getGoBuildTags(uri: vscode.Uri): string {
        return this.getStringSetting(uri, 'buildTags', '');
    }

    private hasTagsFlag(flags: string[]): boolean {
        return flags.some((f) => f === '-tags' || f.startsWith('-tags='));
    }

    private hasVerboseFlag(flags: string[]): boolean {
        return flags.some((f) => f === '-v');
    }

    private getEffectiveGoFlags(uri: vscode.Uri): string[] {
        const testFlags = this.getGoTestFlags(uri);
        if (testFlags.length > 0) {
            return testFlags;
        }
        return this.getGoBuildFlags(uri);
    }

    private getEffectiveGoTags(uri: vscode.Uri): string {
        const testTags = this.getGoTestTags(uri);
        if (testTags) {
            return testTags;
        }
        return this.getGoBuildTags(uri);
    }

    private removeConflictingRunFlags(flags: string[]): string[] {
        const filtered: string[] = [];
        for (let i = 0; i < flags.length; i++) {
            const flag = flags[i];

            if (flag === '-run' || flag === '-test.run') {
                i++; // skip value
                continue;
            }
            if (flag.startsWith('-run=') || flag.startsWith('-test.run=')) {
                continue;
            }

            filtered.push(flag);
        }
        return filtered;
    }

    public runTest(uri: vscode.Uri, testCase: TableTestCase): void {
        void this.runTestInternal(uri, testCase);
    }

    private async runTestInternal(uri: vscode.Uri, testCase: TableTestCase): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                void vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const config = this.getConfig();
            const showOutputChannel = config.get<boolean>('showOutputChannel', true);

            const filePath = uri.fsPath;
            const fileDir = path.dirname(filePath);
            const relativePath = path.relative(workspaceFolder.uri.fsPath, fileDir);

            // Escape test name for regex matching
            const escapedName = this.escapeRegExp(testCase.name);
            const testPattern = `^${testCase.testFunction}$/^${escapedName}$`;

            const effectiveFlags = this.removeConflictingRunFlags(this.getEffectiveGoFlags(uri));
            const effectiveTags = this.getEffectiveGoTags(uri);

            const extraArgsWithoutV = this.hasTagsFlag(effectiveFlags) || !effectiveTags
                ? effectiveFlags
                : [...effectiveFlags, '-tags', effectiveTags];

            const extraArgs = this.hasVerboseFlag(extraArgsWithoutV) ? extraArgsWithoutV : ['-v', ...extraArgsWithoutV];

            this.outputChannel.clear();

            if (showOutputChannel) {
                this.outputChannel.show(true);
            }

            const goExecutablePath = this.resolveGoExecutable(uri);
            const args = ['test', ...extraArgs, '-run', testPattern];
            this.outputChannel.appendLine(`${goExecutablePath} ${args.join(' ')}`);
            this.outputChannel.appendLine('');

            const { exitCode } = await this.execGo(goExecutablePath, fileDir, args, (chunk) => {
                this.outputChannel.append(chunk);
            });

            if (exitCode !== 0) {
                void vscode.window.showErrorMessage(`Test failed (${testCase.testFunction}/${testCase.name})`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Failed to run test: ${errorMessage}`);
            Logger.error('Error running test', error);
        }
    }

    private execGo(
        goExecutablePath: string,
        cwd: string,
        args: string[],
        onOutput: (chunk: string) => void
    ): Promise<{ exitCode: number | null }> {
        return new Promise((resolve) => {
            const proc = spawn(goExecutablePath, args, { cwd, env: process.env });

            proc.stdout.on('data', (data: Buffer) => onOutput(data.toString()));
            proc.stderr.on('data', (data: Buffer) => onOutput(data.toString()));

            proc.on('close', (code) => resolve({ exitCode: code }));
            proc.on('error', (err) => {
                onOutput(`Failed to start go: ${String(err)}\n`);
                resolve({ exitCode: 1 });
            });
        });
    }

    public async debugTest(uri: vscode.Uri, testCase: TableTestCase): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                void vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const filePath = uri.fsPath;
            const fileDir = path.dirname(filePath);

            const escapedName = this.escapeRegExp(testCase.name);
            const testPattern = `^${testCase.testFunction}$/^${escapedName}$`;

            const effectiveFlags = this.getEffectiveGoFlags(uri);
            const effectiveTags = this.getEffectiveGoTags(uri);
            const extraDebugArgs = this.removeConflictingRunFlags(effectiveFlags);

            const buildFlags = effectiveTags && !this.hasTagsFlag(effectiveFlags)
                ? ['-tags', effectiveTags]
                : [];

            // Create debug configuration
            const debugConfig: vscode.DebugConfiguration = {
                name: `Debug: ${testCase.name}`,
                type: 'go',
                request: 'launch',
                mode: 'test',
                program: fileDir,
                args: ['-test.run', testPattern, ...extraDebugArgs],
                ...(buildFlags.length > 0 ? { buildFlags: buildFlags.join(' ') } : {})
            };

            await vscode.debug.startDebugging(workspaceFolder, debugConfig);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Failed to debug test: ${errorMessage}`);
            Logger.error('Error debugging test', error);
        }
    }

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '_');
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}
