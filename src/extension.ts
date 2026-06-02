import * as vscode from 'vscode';
import { createViewCssTs, createViewTs, newModuleTs, newModuleViewTree } from './commands';
import { CompletionProvider } from './completion-provider'
import { DefinitionProvider } from './definition-provider'
import { ReferenceProvider } from './reference-provider'
import { ViewTreeIndex } from './view-tree-index'

export function activate(context: vscode.ExtensionContext) {
	const treeSelector = { language: 'tree', pattern: '**/*.view.tree' }
	const viewTreeIndex = new ViewTreeIndex()
	const completionProvider = new CompletionProvider( viewTreeIndex )
	const definitionProvider = new DefinitionProvider( viewTreeIndex )
	const referenceProvider = new ReferenceProvider( viewTreeIndex )
	const fileWatcher = vscode.workspace.createFileSystemWatcher( '**/*.view.tree' )

	viewTreeIndex.scan()

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider( treeSelector, definitionProvider ),
		vscode.languages.registerReferenceProvider( treeSelector, referenceProvider ),
		vscode.languages.registerCompletionItemProvider(
			treeSelector,
			completionProvider,
			'$',
			' ',
		),
		fileWatcher,
		fileWatcher.onDidChange( uri => viewTreeIndex.updateSingleFile( uri ) ),
		fileWatcher.onDidCreate( uri => viewTreeIndex.updateSingleFile( uri ) ),
		fileWatcher.onDidDelete( uri => viewTreeIndex.removeSingleFile( uri ) ),
		newModuleTs,
		newModuleViewTree,
		createViewTs,
		createViewCssTs,
	)
}
