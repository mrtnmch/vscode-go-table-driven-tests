import * as vscode from 'vscode';
import * as path from 'path';
import { TableTestCase } from './parser';
import { Logger } from './logger';

export class TestRunner {
    private outputChannel: vscode.OutputChannel;
    private terminal: vscode.Terminal | undefined;
    private terminalCwd: string | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Go Table Tests');
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('goTableTests');
    }

    public runTest(uri: vscode.Uri, testCase: TableTestCase): void {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                void vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const config = this.getConfig();
            const showOutputChannel = config.get<boolean>('showOutputChannel', true);
            const reuseTerminal = config.get<boolean>('reuseTerminal', true);

            const filePath = uri.fsPath;
            const fileDir = path.dirname(filePath);
            const relativePath = path.relative(workspaceFolder.uri.fsPath, fileDir);

            // Escape test name for regex matching
            const escapedName = this.escapeRegExp(testCase.name);
            const testPattern = `^${testCase.testFunction}$/^${escapedName}$`;

            if (showOutputChannel) {
                this.outputChannel.clear();
                this.outputChannel.show(true);
                this.outputChannel.appendLine(`Running test case: ${testCase.name}`);
                this.outputChannel.appendLine(`Test function: ${testCase.testFunction}`);
                this.outputChannel.appendLine(`Package: ${relativePath || '.'}\n`);
            }

            // Reuse or create terminal based on config
            if (reuseTerminal) {
                // Check if terminal needs recreation (exited or different directory)
                if (!this.terminal || this.terminal.exitStatus !== undefined || this.terminalCwd !== fileDir) {
                    if (this.terminal && this.terminal.exitStatus === undefined) {
                        this.terminal.dispose();
                    }
                    this.terminal = vscode.window.createTerminal({
                        name: 'Go Table Tests',
                        cwd: fileDir
                    });
                    this.terminalCwd = fileDir;
                }
            } else {
                this.terminal = vscode.window.createTerminal({
                    name: `Test: ${testCase.name}`,
                    cwd: fileDir
                });
                this.terminalCwd = fileDir;
            }

            this.terminal.show();
            // No need to cd since terminal already has correct cwd
            // Use proper shell escaping to prevent injection
            const safePattern = testPattern.replace(/"/g, '\\"');
            this.terminal.sendText(`go test -v -run "${safePattern}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Failed to run test: ${errorMessage}`);
            Logger.error('Error running test', error);
        }
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

            // Create debug configuration
            const debugConfig: vscode.DebugConfiguration = {
                name: `Debug: ${testCase.name}`,
                type: 'go',
                request: 'launch',
                mode: 'test',
                program: fileDir,
                args: ['-test.run', testPattern]
            };

            await vscode.debug.startDebugging(workspaceFolder, debugConfig);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Failed to debug test: ${errorMessage}`);
            Logger.error('Error debugging test', error);
        }
    }

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    public dispose(): void {
        this.outputChannel.dispose();
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}
