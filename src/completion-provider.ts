import * as vscode from 'vscode';
import { ViewTreeIndex } from './view-tree-index'

export class CompletionProvider implements vscode.CompletionItemProvider {
	constructor(
		readonly index: ViewTreeIndex,
	) {
	}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		context: vscode.CompletionContext,
	): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {

		if( !document.fileName.endsWith( '.view.tree' ) ) return undefined

		const lineText = document.lineAt( position ).text
		const trimmedLine = lineText.trim()
		const firstChar = trimmedLine.charAt( 0 )
		const binding = this.findBinding( lineText )

		if( context.triggerCharacter == ' ' && ( !binding || position.character <= binding.end ) ) return undefined

		const wordRange =
			document.getWordRangeAtPosition( position, /[$\w]+/ ) ??
			document.getWordRangeAtPosition( position.translate( 0, -1 ), /[$\w]+/ )

		if( wordRange && document.getText( wordRange ).startsWith( '$' ) ) {
			return this.componentCompletions()
		}

		if( firstChar !== '$' ) {
			const component = this.currentComponent( document, position )
			if( component ) return this.propertyCompletions( component )
		}

		return undefined
	}

	currentComponent( document: vscode.TextDocument, position: vscode.Position ): string | null {
		const lineText = document.lineAt( position.line ).text
		const binding = this.findBinding( lineText )

		if( !binding ) return this.nearestComponentAbove( document, position.line )
		if( position.character >= binding.end ) return this.rootComponent( document )

		return this.nearestComponentAbove( document, position.line - 1 )
	}

	findBinding( text: string ): { start: number; end: number; op: string } | null {
		const match = /<=>|<=|=>/g.exec( text )
		return match ? { op: match[ 0 ], start: match.index, end: match.index + match[ 0 ].length } : null
	}

	rootComponent( document: vscode.TextDocument ): string | null {
		const firstLine = document.lineAt( 0 ).text.replace( /^\uFEFF/, '' )
		const token = firstLine.trim().split( /\s+/ )[ 0 ]
		return token || null
	}

	nearestComponentAbove( document: vscode.TextDocument, startLine: number ): string | null {
		for( let line = Math.min( startLine, document.lineCount - 1 ); line >= 0; line-- ) {
			const text = document.lineAt( line ).text
			if( /^\s*(#|$)/.test( text ) ) continue
			if( /(<=|=>|<=>)/.test( text ) && !/\$[A-Za-z0-9_]+/.test( text ) ) continue

			const match = text.match( /\$[A-Za-z0-9_]+/ )
			if( match ) return match[ 0 ]
		}
		return null
	}

	componentCompletions(): vscode.CompletionItem[] {
		const completions: vscode.CompletionItem[] = []

		for( const componentName of this.index.components.keys() ) {
			const completion = new vscode.CompletionItem( componentName, vscode.CompletionItemKind.Class )
			completion.sortText = `0${ componentName }`
			completions.push( completion )
		}

		return completions
	}

	propertyCompletions( componentName: string ): vscode.CompletionItem[] {
		const completions: vscode.CompletionItem[] = []

		for( const property of this.componentProperties( componentName ) ) {
			const completion = new vscode.CompletionItem( property, vscode.CompletionItemKind.Property )
			completion.sortText = `0${ property }`
			completions.push( completion )
		}

		return completions
	}

	componentProperties( componentName: string, seen = new Set<string>() ): Set<string> {
		const result = new Set<string>()
		const componentData = this.index.components.get( componentName )
		if( !componentData ) return result
		if( seen.has( componentName ) ) return result
		seen.add( componentName )

		if( componentData.base ) {
			for( const property of this.componentProperties( componentData.base, seen ) ) {
				result.add( property )
			}
		}

		for( const property of componentData.properties ) {
			result.add( property )
		}

		return result
	}
}
