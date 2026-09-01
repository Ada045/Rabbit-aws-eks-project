import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./database/db.js";
import userRoute from "./routes/user.route.js";
import courseRoute from "./routes/course.route.js";
import mediaRoute from "./routes/media.route.js";
import purchaseCourseRoute from "./routes/purchaseCourse.route.js";
import courseProgressRoute from "./routes/courseProgress.route.js";
import path from 'path';

dotenv.config({});
connectDB();
const app = express();

const PORT = process.env.PORT || 3000 ;

const __dirname = path.resolve();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin:process.env.FRONTEND_URL,
    credentials:true
}));


// api
app.use("/api/v1/media", mediaRoute);
app.use("/api/v1/user", userRoute);
app.use("/api/v1/course", courseRoute);
app.use("/api/v1/purchase", purchaseCourseRoute);
app.use("/api/v1/progress", courseProgressRoute);


app.get('/health', (_, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on : ${PORT}`)
})
