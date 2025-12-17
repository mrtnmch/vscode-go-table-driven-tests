import * as assert from 'assert';
import * as vscode from 'vscode';
import { TableTestParser } from '../../parser';

suite('TableTestParser Test Suite', () => {
    let parser: TableTestParser;

    setup(() => {
        parser = new TableTestParser();
    });

    test('Should parse basic table test with name field', async () => {
        const content = `package main

import "testing"

func TestExample(t *testing.T) {
    tests := []struct {
        name string
        want int
    }{
        {name: "test case 1", want: 1},
        {name: "test case 2", want: 2},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // test code
        })
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 2);
        assert.strictEqual(testCases[0].name, 'test case 1');
        assert.strictEqual(testCases[0].testFunction, 'TestExample');
        assert.strictEqual(testCases[1].name, 'test case 2');
        assert.strictEqual(testCases[1].testFunction, 'TestExample');
    });

    test('Should parse table test with Name field (capitalized)', async () => {
        const content = `package main

import "testing"

func TestExample(t *testing.T) {
    tests := []struct {
        Name string
        want int
    }{
        {Name: "capitalized test", want: 1},
    }

    for _, tt := range tests {
        t.Run(tt.Name, func(t *testing.T) {
            // test code
        })
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 1);
        assert.strictEqual(testCases[0].name, 'capitalized test');
    });

    test('Should parse table test with var declaration', async () => {
        const content = `package main

import "testing"

func TestExample(t *testing.T) {
    var tests = []struct {
        name string
        want int
    }{
        {name: "var test", want: 1},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // test code
        })
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 1);
        assert.strictEqual(testCases[0].name, 'var test');
    });

    test('Should parse table test when helper types exist before tests slice', async () => {
        const content = `package main

import "testing"

func TestParseNestedTableTest(t *testing.T) {
    type args struct {
        str string
    }

    tests := []struct {
        name string
        args args
        want int
    }{
        {
            name: "case 1",
            args: args{str: "nested table test"},
            want: 1,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {})
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 1);
        assert.strictEqual(testCases[0].name, 'case 1');
        assert.strictEqual(testCases[0].testFunction, 'TestParseNestedTableTest');
    });

    test('Should parse table test when the slice is called testCases', async () => {
        const content = `package main

import "testing"

func TestParseNestedTableTest(t *testing.T) {
    testCases := []struct {
        name string
        args args
        want int
    }{
        {
            name: "case 1",
            args: args{str: "nested table test"},
            want: 1,
        },
    }

    for _, tt := range testCases {
        t.Run(tt.name, func(t *testing.T) {})
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 1);
        assert.strictEqual(testCases[0].name, 'case 1');
        assert.strictEqual(testCases[0].testFunction, 'TestParseNestedTableTest');
    });


    test('Should handle empty file', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: '',
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 0);
    });

    test('Should handle file with no tests', async () => {
        const content = `package main

func main() {
    println("hello")
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 0);
    });

    test('Should handle multiple test functions', async () => {
        const content = `package main

import "testing"

func TestFirst(t *testing.T) {
    tests := []struct {
        name string
    }{
        {name: "first test"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {})
    }
}

func TestSecond(t *testing.T) {
    tests := []struct {
        name string
    }{
        {name: "second test"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {})
    }
}`;

        const document = await vscode.workspace.openTextDocument({
            content,
            language: 'go'
        });

        const testCases = parser.parseDocument(document);

        assert.strictEqual(testCases.length, 2);
        assert.strictEqual(testCases[0].testFunction, 'TestFirst');
        assert.strictEqual(testCases[1].testFunction, 'TestSecond');
    });
});
