const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv").config({ path: "./.env" });
const swaggerUi = require("swagger-ui-express");
const mongoose = require("mongoose");
const swaggerJsdoc = require("swagger-jsdoc");
const cookieParser = require("cookie-parser");
const adminRoutes = require("./Routes/Adminroutes");

app.use(cors());
app.use(express.json());
app.options("*", cors());
app.use(cookieParser());


const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Admin Apis",
      version: "1.0.0",
      description: "Apis for managing admins & Agents",
    },
    servers: [
      {
        url: "http://loclhost/api/v1",
        description: "Development server",
      },
    ],
  },
  apis: ["./Routes/Adminroutes.js"],
};

const swaggerSpec = swaggerJsdoc(options);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("DB connection Successful");
  } catch (error) {
    console.error("Error occurred while connecting to DB:", error);
  }
};
connectDB();


app.use("/api/v1", adminRoutes);


const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});


app.get("/", (req, res) => {
  res.send("Hello World");
});
