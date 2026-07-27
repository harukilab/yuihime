import "dotenv/config";

async function test() {
  const badKey = "AIzaSyBalcy9JzGLDS194SsYN7pn4cJRZDBGggo";
  console.log("Testing streamGenerateContent with key:", badKey);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:streamGenerateContent?key=${badKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
    });
    console.log("Stream status:", response.status);
    const body = await response.text();
    console.log("Stream response:", body.substring(0, 1000));
  } catch (err: any) {
    console.error("FAILED testing stream:", err.message || err);
  }
}

test();
