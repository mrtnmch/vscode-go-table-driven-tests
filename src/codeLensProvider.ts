import * as vscode from 'vscode';
import { TableTestParser } from './parser';
import { Logger } from './logger';

export class GoTableTestCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private parser: TableTestParser;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        this.parser = new TableTestParser();
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (document.languageId !== 'go') {
            return [];
        }

        try {
            const testCases = this.parser.parseDocument(document);
            const codeLenses: vscode.CodeLens[] = [];

            for (const testCase of testCases) {
                if (token.isCancellationRequested) {
                    return [];
                }

                const range = new vscode.Range(testCase.line, 0, testCase.line, 0);

                const runCommand: vscode.Command = {
                    title: 'run test',
                    command: 'go-table-tests.runTest',
                    arguments: [document.uri, testCase]
                };

                const debugCommand: vscode.Command = {
                    title: 'debug test',
                    command: 'go-table-tests.debugTest',
                    arguments: [document.uri, testCase]
                };

                codeLenses.push(new vscode.CodeLens(range, runCommand));
                codeLenses.push(new vscode.CodeLens(range, debugCommand));
            }

            return codeLenses;
        } catch (error) {
            Logger.error('Error providing CodeLens', error);
            return [];
        }
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public dispose(): void {
        this._onDidChangeCodeLenses.dispose();
    }
}
