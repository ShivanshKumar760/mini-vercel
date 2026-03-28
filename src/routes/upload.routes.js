import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadAndDeploy } from "../controllers/upload.controller.js";

const router = Router();
router.use(authMiddleware);

// Custom storage: memoryStorage + attach relativePath from the form fields
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

router.post(
  "/",
  // Step 1: parse the multipart body with multer
  upload.fields([
    { name: "build", maxCount: 1 }, // zip upload
    { name: "files", maxCount: 1000 }, // folder / multi-file upload
  ]),

  // Step 2: attach webkitRelativePath to each file object
  // The frontend sends it as:  formData.append("relativePaths", JSON.stringify(paths))
  // where paths is an array matching the order of the "files" field.
  (req, res, next) => {
    try {
      // Normalize: single zip → req.file
      if (req.files?.build?.[0]) {
        req.file = req.files.build[0];
        return next();
      }

      // Multi-file upload
      const fileArr = req.files?.files;
      if (fileArr?.length) {
        // Parse the relativePaths JSON array sent alongside the files
        let relativePaths = [];
        try {
          relativePaths = JSON.parse(req.body.relativePaths || "[]");
        } catch (_) {}

        // Attach relativePath to each file object
        fileArr.forEach((f, i) => {
          f.relativePath = relativePaths[i] || f.originalname;
        });

        req.files = fileArr; // flatten to array
        return next();
      }

      next();
    } catch (err) {
      next(err);
    }
  },

  uploadAndDeploy
);

export default router;
