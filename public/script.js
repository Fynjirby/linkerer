async function shortenUrl() {
	const token = turnstile.getResponse();
	if (!token) {
		return alert("Please solve the CAPTCHA");
	}
	if (turnstile.isExpired()) {
		return alert("The CAPTCHA has expired. Please solve it again.");
	}

	const url = document.getElementById("urlInput").value;
	if (!url) {
		alert("Please enter a URL");
		return;
	}

	const response = await fetch("/shorten?v=" + Math.random().toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, token: turnstile.getResponse() }),
	});

	const data = await response.json();

	if (data.error) {
		alert(data.error);
		return;
	}

	const resultElement = document.getElementById("result");
	resultElement.innerHTML = `Shortened URL: <a href="${data.shortUrl}" target="_blank">${data.shortUrl}</a>`;

	const copyButton = document.getElementById("copyButton");
	copyButton.style.display = "inline-block";

	turnstile.reset(document.querySelector(".cf-turnstile"));
}
