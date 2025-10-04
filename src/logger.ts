import * as vscode from 'vscode';

/**
 * Centralized logging utility for the extension
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;

    /**
     * Initialize the logger with an output channel
     */
    public static initialize(channel: vscode.OutputChannel): void {
        Logger.outputChannel = channel;
    }

    /**
     * Log an info message
     */
    public static info(message: string): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[INFO] ${message}`);
        }
    }

    /**
     * Log a warning message
     */
    public static warn(message: string): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[WARN] ${message}`);
        }
    }

    /**
     * Log an error message
     */
    public static error(message: string, error?: unknown): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[ERROR] ${message}`);
            if (error) {
                if (error instanceof Error) {
                    Logger.outputChannel.appendLine(`  ${error.message}`);
                    if (error.stack) {
                        Logger.outputChannel.appendLine(`  ${error.stack}`);
                    }
                } else {
                    Logger.outputChannel.appendLine(`  ${String(error)}`);
                }
            }
        }
    }

    /**
     * Log a debug message
     */
    public static debug(message: string): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[DEBUG] ${message}`);
        }
    }
}
