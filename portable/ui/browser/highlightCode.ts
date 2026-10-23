import { element } from './elements.ts'
import styles from './styles.module.css'

const STRING_START = /^["'`]/
const NUMBER_START = /^\d/

const TOKENS =
	/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b(?:async|await|break|case|class|const|continue|default|else|export|extends|false|for|from|function|if|implements|import|in|interface|let|new|null|of|readonly|return|switch|throw|true|try|type|typeof|undefined|void|while)\b|\b\d+(?:\.\d+)?\b)/g

const tokenClass = (token: string): string => {
	if (token.startsWith('//')) {
		return styles.syntaxComment
	}
	if (STRING_START.test(token)) {
		return styles.syntaxString
	}
	return NUMBER_START.test(token) ? styles.syntaxNumber : styles.syntaxKeyword
}

export const highlightCode = (line: string): HTMLElement => {
	const code = element('code')
	let offset = 0
	for (const match of line.matchAll(TOKENS)) {
		code.append(
			document.createTextNode(line.slice(offset, match.index)),
			element('span', match[0], tokenClass(match[0]))
		)
		offset = match.index + match[0].length
	}
	code.append(document.createTextNode(line.slice(offset) || (line ? '' : ' ')))
	return code
}
