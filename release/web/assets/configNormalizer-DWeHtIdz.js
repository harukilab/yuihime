function i(r){return r?(Array.isArray(r)?r.join(`
`):String(r)).split(/[\n,;]+/).map(t=>t.trim()).filter(t=>t.length>0&&!t.toLowerCase().includes("your_api_key")):[]}function e(r,n=""){return r?Array.isArray(r)?r.find(t=>typeof t=="string"&&t.trim().length>0)||n:String(r).trim()||n:n}export{i as a,e as t};
