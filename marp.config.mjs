import markdownItKroki from "@kazumatu981/markdown-it-kroki";

export default {
  allowLocalFiles: true,
  engine: ({ marp }) =>
    marp.use(markdownItKroki, {
      entrypoint: "https://kroki.io",
      imageFormat: "svg",
    }),
};
