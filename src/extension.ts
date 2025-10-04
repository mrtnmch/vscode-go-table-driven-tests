import * as vscode from 'vscode';
import { GoTableTestCodeLensProvider } from './codeLensProvider';
import { TestRunner } from './testRunner';
import { TableTestCase } from './parser';
import { Logger } from './logger';

// Per-document debounce timers
const debounceTimers = new Map<string, NodeJS.Timeout>();

function getDebounceDelay(): number {
    const config = vscode.workspace.getConfiguration('goTableTests');
    return config.get<number>('debounceDelay', 500);
}

export function activate(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel('Go Table Tests');
    Logger.initialize(outputChannel);
    Logger.info('Go Table-Driven Tests extension is now active');

    const testRunner = new TestRunner();
    const codeLensProvider = new GoTableTestCodeLensProvider();

    // Register CodeLens provider
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'go', scheme: 'file' },
        codeLensProvider
    );

    // Register run test command
    const runTestCommand = vscode.commands.registerCommand(
        'go-table-tests.runTest',
        (uri: vscode.Uri, testCase: TableTestCase) => {
            testRunner.runTest(uri, testCase);
        }
    );

    // Register debug test command
    const debugTestCommand = vscode.commands.registerCommand(
        'go-table-tests.debugTest',
        async (uri: vscode.Uri, testCase: TableTestCase) => {
            await testRunner.debugTest(uri, testCase);
        }
    );

    // Refresh CodeLens on document save
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'go') {
            codeLensProvider.refresh();
        }
    });

    // Debounced refresh on document change (per-document)
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'go') {
            const docUri = event.document.uri.toString();

            // Clear existing timer for this document
            const existingTimer = debounceTimers.get(docUri);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            // Set new timer for this document
            const delay = getDebounceDelay();
            const timer = setTimeout(() => {
                codeLensProvider.refresh();
                debounceTimers.delete(docUri);
            }, delay);

            debounceTimers.set(docUri, timer);
        }
    });

    // Clean up timers when documents are closed
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === 'go') {
            const docUri = document.uri.toString();
            const timer = debounceTimers.get(docUri);
            if (timer) {
                clearTimeout(timer);
                debounceTimers.delete(docUri);
            }
        }
    });

    context.subscriptions.push(
        codeLensProviderDisposable,
        runTestCommand,
        debugTestCommand,
        onSaveDisposable,
        onChangeDisposable,
        onCloseDisposable,
        testRunner,
        outputChannel,
        codeLensProvider
    );
}

export function deactivate(): void {
    // Clear all timers
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();
}
