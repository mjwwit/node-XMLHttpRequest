import XMLHttpRequest from 'xmlhttprequest-ssl'

const xhr = new XMLHttpRequest()

xhr.onreadystatechange = () => {
	console.log(`State: ${xhr.readyState}`)

	if (xhr.readyState === xhr.DONE) {
		console.log(`Complete.\nBody length: ${xhr.responseText.length}`)
		console.log(`Body:\n${xhr.responseText}`)
	}
}

xhr.onerror = () => {
	console.error('Request failed')
	process.exitCode = 1
}

xhr.open('GET', process.argv[2] ?? 'https://example.com')
xhr.send()
