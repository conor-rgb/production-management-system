import { createServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
const app = createServer();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log("API listening on port " + port);
});
