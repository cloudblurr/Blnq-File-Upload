import http from "http";

const server = http.createServer((req, res) => {
  console.log("Headers:", req.headers);
  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });
  req.on("end", () => {
    console.log("Body:", body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(4455, () => {
  console.log("Server listening on 4455");
});
