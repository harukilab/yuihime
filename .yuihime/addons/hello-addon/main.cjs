const args = JSON.parse(process.argv[2] || '{}');
console.log(JSON.stringify({
  success: true,
  message: args.greeting || "Hello!",
  timestamp: Date.now()
}));
