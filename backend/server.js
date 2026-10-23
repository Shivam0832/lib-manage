require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Libra Library Management System running on http://localhost:${PORT}`);
});
