import * as vscode from 'vscode';

export type Component = {
	base?: string
	properties: Set<string>
	file: string
	range?: vscode.Range
}

export type ComponentRef = {
	name: string
	file: string
	range: vscode.Range
	declaration: boolean
}

export type PropertyRef = {
	name: string
	component: string
	file: string
	range: vscode.Range
	declaration: boolean
}

export class ViewTreeIndex {
	components = new Map<string, Component>()
	componentRefs: ComponentRef[] = []
	propertyRefs: PropertyRef[] = []

	async updateSingleFile( uri: vscode.Uri ) {
		this.dropFile( uri )

		const components = await this.componentsFromFile( uri )
		for( const [ component, componentData ] of components ) {
			this.mergeComponent( this.components, component, componentData )
		}
	}

	async removeSingleFile( uri: vscode.Uri ) {
		this.dropFile( uri )
	}

	dropFile( uri: vscode.Uri ) {
		for( const [ component, componentData ] of this.components ) {
			if( componentData.file === uri.path ) this.components.delete( component )
		}
		this.componentRefs = this.componentRefs.filter( ref => ref.file != uri.path )
		this.propertyRefs = this.propertyRefs.filter( ref => ref.file != uri.path )
	}

	async scan() {
		const components = new Map<string, Component>()
		const componentRefs: ComponentRef[] = []
		const propertyRefs: PropertyRef[] = []

		if( !vscode.workspace.workspaceFolders ) {
			this.components = components
			this.componentRefs = componentRefs
			this.propertyRefs = propertyRefs
			return
		}

		const viewTreeFiles = await vscode.workspace.findFiles( '**/*.view.tree', '**/node_modules/**' )

		for( const file of viewTreeFiles ) {
			const componentsFromFile = await this.componentsFromFile( file )
			for( const [ component, componentData ] of componentsFromFile ) {
				this.mergeComponent( components, component, componentData )
			}
			componentRefs.push( ...this.componentRefs.filter( ref => ref.file == file.path ) )
			propertyRefs.push( ...this.propertyRefs.filter( ref => ref.file == file.path ) )
		}

		this.components = components
		this.componentRefs = componentRefs
		this.propertyRefs = propertyRefs
	}

	parseViewTreeFile( content: string, file: string ): Map<string, Component> {
		const components = new Map<string, Component>()
		let currentComponent: string | null = null
		const componentByIndent = new Map<number, string>()
		const ensureComponent = ( name: string )=> {
			if( !components.has( name ) ) components.set( name, { properties: new Set(), file } )
			return components.get( name )!
		}

		for( const [ lineIndex, line ] of content.split( '\n' ).entries() ) {
			const trimmed = line.trim()
			if( !trimmed ) continue
			if( trimmed.startsWith( '#' ) ) continue
			const indent = line.match( /^\t*/ )![0].length
			for( const key of componentByIndent.keys() ) {
				if( key >= indent ) componentByIndent.delete( key )
			}

			for( const match of line.matchAll( /(?:^|[^\w\\])(\$[A-Za-z0-9_]+)/g ) ) {
				const name = match[ 1 ]
				const start = match.index! + match[0].length - name.length
				const range = new vscode.Range(
					new vscode.Position( lineIndex, start + 1 ),
					new vscode.Position( lineIndex, start + name.length ),
				)
				ensureComponent( name )
				this.componentRefs.push({ name, file, range, declaration: indent == 0 && start == 0 })
			}

			if( !line.startsWith( '\t' ) ) {
				const [ component, base ] = trimmed.split( /\s+/ )
				const range = new vscode.Range(
					new vscode.Position( lineIndex, 1 ),
					new vscode.Position( lineIndex, component.length ),
				)
				currentComponent = component
				components.set( currentComponent, { base, properties: new Set(), file, range } )
				componentByIndent.set( 0, currentComponent )
				continue
			}

			if( !currentComponent ) continue
			const componentData = ensureComponent( currentComponent )
			const owner = componentByIndent.get( indent - 1 ) ?? currentComponent

			if( !line.startsWith( '\t\t' ) ) {
				const property = trimmed.split( /\s+/ )[ 0 ]
				componentData.properties.add( property )
				this.propertyRefs.push({
					name: property,
					component: currentComponent,
					file,
					range: new vscode.Range(
						new vscode.Position( lineIndex, indent ),
						new vscode.Position( lineIndex, indent + property.length ),
					),
					declaration: true,
				})
			} else {
				const property = trimmed.split( /\s+/ )[ 0 ]
				if( property && ![ '<=', '=>', '<=>' ].includes( property ) ) {
					this.propertyRefs.push({
						name: property,
						component: owner,
						file,
						range: new vscode.Range(
							new vscode.Position( lineIndex, indent ),
							new vscode.Position( lineIndex, indent + property.length ),
						),
						declaration: false,
					})
				}
			}

			for( const match of trimmed.matchAll( /(?:<=>|<=|=>)\s+([A-Za-z_][A-Za-z0-9_*?]*)/g ) ) {
				const property = match[ 1 ]
				const start = indent + match.index! + match[0].length - property.length
				componentData.properties.add( property )
				this.propertyRefs.push({
					name: property,
					component: currentComponent,
					file,
					range: new vscode.Range(
						new vscode.Position( lineIndex, start ),
						new vscode.Position( lineIndex, start + property.length ),
					),
					declaration: false,
				})
			}

			const className = [ ...line.matchAll( /(?:^|[^\w\\])(\$[A-Za-z0-9_]+)/g ) ].at( -1 )?.[ 1 ]
			if( className ) componentByIndent.set( indent, className )
		}

		return components
	}

	async componentsFromFile( uri: vscode.Uri ): Promise<Map<string, Component>> {
		const components = new Map<string, Component>()

		if( uri.path.includes( '/-/' ) || uri.path.includes( '/-view.tree/' ) ) return components

		try {
			const buffer = await vscode.workspace.fs.readFile( uri )
			const content = buffer.toString()
			this.dropFile( uri )
			return this.parseViewTreeFile( content, uri.path )
		} catch {}

		return components
	}

	mergeComponent( components: Map<string, Component>, component: string, componentData: Component ) {
		if( components.has( component ) && !componentData.range && componentData.properties.size === 0 ) return
		components.set( component, componentData )
	}

	classReferences( name: string, includeDeclaration: boolean ) {
		return this.componentRefs
			.filter( ref => ref.name == name )
			.filter( ref => includeDeclaration || !ref.declaration )
			.map( ref => new vscode.Location( vscode.Uri.file( ref.file ), ref.range ) )
	}

	propertyReferences( component: string, property: string, includeDeclaration: boolean ) {
		const owner = this.propertyOwner( component, property )
		return this.propertyRefs
			.filter( ref => ref.name == property )
			.filter( ref => this.propertyOwner( ref.component, property ) == owner )
			.filter( ref => includeDeclaration || !ref.declaration )
			.map( ref => new vscode.Location( vscode.Uri.file( ref.file ), ref.range ) )
	}

	propertyRefAt( file: string, position: vscode.Position ) {
		return this.propertyRefs.find( ref => {
			return ref.file == file && ref.range.contains( position )
		})
	}

	propertyOwner( component: string, property: string, seen = new Set<string>() ): string {
		const componentData = this.components.get( component )
		if( !componentData ) return component
		if( seen.has( component ) ) return component
		seen.add( component )

		if( componentData.properties.has( property ) ) return component
		if( componentData.base ) return this.propertyOwner( componentData.base, property, seen )
		return component
	}

	async classLocationByFqn( nodeName: string ) {
		const className = '$' + nodeName

		for( const candidate of this.viewTreeFqnParents( nodeName ) ) {
			const component = this.components.get( className )
			if( component?.file == candidate.path && component.range ) {
				return new vscode.Location( candidate, component.range )
			}

			const components = await this.componentsFromFile( candidate )
			for( const [ componentName, componentData ] of components ) {
				this.mergeComponent( this.components, componentName, componentData )
			}

			const parsedComponent = components.get( className )
			if( parsedComponent?.range ) return new vscode.Location( candidate, parsedComponent.range )
		}
	}

	viewTreeFqnParents( nodeName: string ) {
		const parts = nodeName.split( '_' )
		const result: vscode.Uri[] = []

		for( let count = parts.length; count > 0; count-- ) {
			const path = parts.slice( 0, count )
			result.push( vscode.Uri.joinPath( this.mamUri(), path.join( '/' ), path.at( -1 ) + '.view.tree' ) )
		}

		return result
	}

	mamUri() {
		return vscode.workspace.workspaceFolders![0].uri
	}
}
