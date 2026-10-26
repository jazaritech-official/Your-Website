import mongoose from "mongoose";

const homepageBannerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["carousel", "categoryBanner", "brandBanner"],
      required: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    imagePublicId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    subtitle: {
      type: String,
      default: "",
    },
    tag: {
      type: String,
      default: "",
    },
    link: {
      type: String,
      default: "",
    },
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const HomepageBanner = mongoose.model(
  "HomepageBanner",
  homepageBannerSchema,
);
