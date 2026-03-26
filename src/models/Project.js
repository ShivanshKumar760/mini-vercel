import mongoose from "mongoose";
import { Schema } from "mongoose";

const ProjectSchema = new Schema({
  name: String,
  githubUrl: String,
  buildCommand: String,
  startCommand: String,
  subdomain: String,
  containerId: String,
  url: String,
  // Owner relation so we can restrict reads per logged-in user.
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

const Project = mongoose.model("Project", ProjectSchema);
export default Project;
