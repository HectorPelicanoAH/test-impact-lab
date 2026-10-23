import { createHash } from 'node:crypto'

export const bytesHash = (value: string | Uint8Array): string =>
	createHash('sha256').update(value).digest('hex')

export const requireCondition: (
	condition: unknown,
	message: string
) => asserts condition = (condition, message) => {
	if (!condition) {
		throw new Error(`Invalid viewer input: ${message}`)
	}
}

const INVALID_PATH_CHARACTERS = /[\\:]/

export const relativePath = (path: string): void => {
	requireCondition(
		!INVALID_PATH_CHARACTERS.test(path) &&
			![...path].some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
			) &&
			!path.startsWith('/') &&
			path
				.split('/')
				.every((part) => part !== '' && part !== '.' && part !== '..'),
		'Expected a relative POSIX source path without traversal'
	)
}
