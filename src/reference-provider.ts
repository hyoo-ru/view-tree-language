import * as vscode from 'vscode';
import { ViewTreeIndex } from './view-tree-index'

export class ReferenceProvider implements vscode.ReferenceProvider {
	constructor(
		readonly index: ViewTreeIndex,
	) {
	}

	async provideReferences(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.ReferenceContext,
		_token: vscode.CancellationToken,
	): Promise<vscode.Location[]> {

		if( !document.fileName.endsWith( '.view.tree' ) ) return []

		const classRange = document.getWordRangeAtPosition( position, /\$[A-Za-z0-9_]+/ )
		if( classRange ) {
			return this.index.classReferences( document.getText( classRange ), context.includeDeclaration )
		}

		const propertyRange = document.getWordRangeAtPosition( position, /[A-Za-z_][A-Za-z0-9_*?]*/ )
		if( !propertyRange ) return []

		const property = document.getText( propertyRange )
		const ref = this.index.propertyRefAt( document.uri.path, position )
		if( !ref ) return []

		return this.index.propertyReferences( ref.component, property, context.includeDeclaration )
	}
}
