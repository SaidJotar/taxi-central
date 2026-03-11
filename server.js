const { server, port } = require("./src/app");

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});