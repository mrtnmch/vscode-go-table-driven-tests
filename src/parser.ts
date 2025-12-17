import * as vscode from 'vscode';
import { Logger } from './logger';

export interface TableTestCase {
    name: string;
    line: number;
    testFunction: string;
}

const MAX_TEST_NAME_LENGTH = 500;
const MAX_FILE_SIZE_LINES = 50000;

export class TableTestParser {
    /**
     * Parses a Go test file to find table-driven test cases
     */
    public parseDocument(document: vscode.TextDocument): TableTestCase[] {
        const testCases: TableTestCase[] = [];

        try {
            const text = document.getText();
            const lines = text.split('\n');

            // Check file size limit
            if (lines.length > MAX_FILE_SIZE_LINES) {
                Logger.warn(`File ${document.fileName} has ${lines.length} lines, exceeding limit of ${MAX_FILE_SIZE_LINES}. Parsing may be slow.`);
            }

            let currentTestFunction: string | null = null;
            let inTestsSlice = false;
            let braceDepth = 0;
            let enteredTestBody = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // Detect test function
                const testFuncMatch = line.match(/func\s+(Test\w+)\s*\(/);
                if (testFuncMatch) {
                    currentTestFunction = testFuncMatch[1];
                    inTestsSlice = false;
                    braceDepth = 0;
                    enteredTestBody = false;
                }

                if (!currentTestFunction) {
                    continue;
                }

                // Track brace depth, but skip strings and comments
                braceDepth = this.calculateBraceDepth(line, braceDepth);
                if (!enteredTestBody && braceDepth > 0) {
                    enteredTestBody = true;
                }

                // Reset when exiting test function
                if (enteredTestBody && braceDepth === 0 && currentTestFunction) {
                    currentTestFunction = null;
                    inTestsSlice = false;
                    continue;
                }

                // Detect start of tests slice (common patterns)
                if (trimmedLine.match(/test.*s?\s*:?=\s*\[\]struct\s*\{/) ||
                    trimmedLine.match(/test.*s?\s*:?=\s*\[\]\w+\s*\{/) ||
                    trimmedLine.match(/(?:var\s+)?test.*s?\s*=\s*\[\]struct\s*\{/) ||
                    trimmedLine.match(/(?:var\s+)?test.*s?\s*=\s*\[\]\w+\s*\{/)) {
                    inTestsSlice = true;
                    continue;
                }

                // Parse test case names within the tests slice
                if (inTestsSlice && currentTestFunction) {
                    // Match: name: "test name",
                    const nameMatch = trimmedLine.match(/(?:name|Name)\s*:\s*["']([^"']+)["']/);
                    if (nameMatch && nameMatch[1]) {
                        const testName = this.validateTestName(nameMatch[1]);
                        if (testName) {
                            testCases.push({
                                name: testName,
                                line: i,
                                testFunction: currentTestFunction
                            });
                        }
                    }

                    // Also match: {"test name", ...} pattern (without name field)
                    const literalMatch = trimmedLine.match(/^\{\s*["']([^"']+)["']/);
                    if (literalMatch && literalMatch[1] && !nameMatch) {
                        const testName = this.validateTestName(literalMatch[1]);
                        if (testName) {
                            testCases.push({
                                name: testName,
                                line: i,
                                testFunction: currentTestFunction
                            });
                        }
                    }
                }
            }
        } catch (error) {
            Logger.error('Error parsing Go test document', error);
        }

        return testCases;
    }

    /**
     * Calculates brace depth while ignoring braces in strings, comments, and raw strings
     */
    private calculateBraceDepth(line: string, currentDepth: number): number {
        let depth = currentDepth;
        let inString = false;
        let inRawString = false;
        let stringChar = '';
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = i + 1 < line.length ? line[i + 1] : '';

            // Check for line comment
            if (!inString && !inRawString && char === '/' && nextChar === '/') {
                break; // Ignore rest of line
            }

            // Check for raw string (backtick)
            if (char === '`' && !inString) {
                inRawString = !inRawString;
                i++;
                continue;
            }

            // Skip if in raw string
            if (inRawString) {
                i++;
                continue;
            }

            // Check for regular string start/end
            if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
                i++;
                continue;
            }

            // Skip escaped characters in strings
            if (inString && char === '\\' && nextChar) {
                i += 2;
                continue;
            }

            // Count braces only if not in string or raw string
            if (!inString && !inRawString) {
                if (char === '{') {
                    depth++;
                } else if (char === '}') {
                    depth--;
                }
            }

            i++;
        }

        return depth;
    }

    /**
     * Validates and sanitizes test name
     * Returns null if invalid
     */
    private validateTestName(name: string): string | null {
        // Check for empty or whitespace-only
        if (!name || name.trim().length === 0) {
            Logger.warn('Skipping empty test name');
            return null;
        }

        // Check for excessive length
        if (name.length > MAX_TEST_NAME_LENGTH) {
            Logger.warn(`Test name too long (${name.length} chars): ${name.substring(0, 50)}...`);
            return null;
        }

        // Check for dangerous characters (null bytes, control characters)
        // Allow newlines and tabs as they might be escaped in Go strings
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(name)) {
            Logger.warn(`Test name contains control characters: ${name.substring(0, 50)}`);
            return null;
        }

        return name;
    }
}
