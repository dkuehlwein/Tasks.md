const fs = require("fs");
const taskOps = require("./task-operations");

const PUID = Number(process.env.PUID) || 1000;
const PGID = Number(process.env.PGID) || 1000;

/**
 * Configuration and metadata operations
 */

async function getTags() {
  const files = await taskOps.getMdFiles();
  const filesContents = await Promise.all(
    files.map((file) =>
      taskOps.getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
    )
  );
  const usedTagsTexts = filesContents
    .map((content) => taskOps.getTagsTextsFromCardContent(content))
    .flat()
    .sort((a, b) => a.localeCompare(b));
  const usedTagsTextsWithoutDuplicates = Array.from(
    new Set(usedTagsTexts.map((tagText) => tagText.toLowerCase()))
  );
  const allTags = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/tags.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => []);
  const usedTags = usedTagsTextsWithoutDuplicates.map(
    (tag) =>
      allTags.find((tagToFind) => tagToFind.name.toLowerCase() === tag) || {
        name: tag,
        backgroundColor: "var(--color-alt-1)",
      }
  );
  return { all: allTags, used: usedTags };
}

async function saveTags(tags) {
  const newTags = JSON.stringify(tags || []);
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}`, { recursive: true });
  await fs.promises.writeFile(`${process.env.CONFIG_DIR}/tags.json`, newTags);
  await fs.promises.chown(`${process.env.CONFIG_DIR}/tags.json`, PUID, PGID);
  return { success: true };
}

async function getTitle() {
  try {
    const title = await fs.promises
      .readFile(`${process.env.CONFIG_DIR}/title.txt`)
      .then((res) => res.toString().trim())
      .catch((err) => "Tasks.md");
    return title;
  } catch (error) {
    return "Tasks.md";
  }
}

async function getLanesSort() {
  try {
    const lanesSort = await fs.promises
      .readFile(`${process.env.CONFIG_DIR}/sort/lanes.json`)
      .then((res) => JSON.parse(res.toString()))
      .catch((err) => []);
    return lanesSort;
  } catch (error) {
    return [];
  }
}

async function saveLanesSort(sortData) {
  const newSort = JSON.stringify(sortData || []);
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/sort`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/sort/lanes.json`,
    newSort
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/sort/lanes.json`,
    PUID,
    PGID
  );
  return { success: true };
}

async function getCardsSort() {
  try {
    const cardsSort = await fs.promises
      .readFile(`${process.env.CONFIG_DIR}/sort/cards.json`)
      .then((res) => JSON.parse(res.toString()))
      .catch((err) => {});
    return cardsSort || {};
  } catch (error) {
    return {};
  }
}

async function saveCardsSort(sortData) {
  const newSort = JSON.stringify(sortData || {});
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/sort`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/sort/cards.json`,
    newSort
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/sort/cards.json`,
    PUID,
    PGID
  );
  return { success: true };
}

async function saveImage(imageName, imageBuffer) {
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/images`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/images/${imageName}`,
    imageBuffer
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/images/${imageName}`,
    PUID,
    PGID
  );
  return { success: true, imageName };
}

async function removeUnusedImages() {
  try {
    const files = await taskOps.getMdFiles();
    const filesContents = await Promise.all(
      files.map(async (file) =>
        taskOps.getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
      )
    );
    const imagesBeingUsed = filesContents
      .map((content) => content.match(/!\[[^\]]*\]\(([^\s]+[.]*)\)/g))
      .flat()
      .filter((image) => !!image && image.includes("/api/images/"))
      .map((image) => image.split("/api/images/")[1].slice(0, -1));
    
    const allImages = await fs.promises.readdir(
      `${process.env.CONFIG_DIR}/images`
    );
    const unusedImages = allImages.filter(
      (image) => !imagesBeingUsed.includes(image)
    );
    
    await Promise.all(
      unusedImages.map((image) =>
        fs.promises.rm(`${process.env.CONFIG_DIR}/images/${image}`)
      )
    );
    
    return { success: true, removedCount: unusedImages.length, removedImages: unusedImages };
  } catch (error) {
    throw new Error(`Failed to remove unused images: ${error.message}`);
  }
}

module.exports = {
  getTags,
  saveTags,
  getTitle,
  getLanesSort,
  saveLanesSort,
  getCardsSort,
  saveCardsSort,
  saveImage,
  removeUnusedImages
}; 