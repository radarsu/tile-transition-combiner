import _ = require("lodash");
import fs = require("fs-extra-promise");
import gm = require("gm");
import path = require("path");
import child_process = require("child_process");
const exec = child_process.exec;

const tilesDir = "./tiles";
const tilesResizedDir = "./tiles-resized";
const tilesOutDir = "./tiles-out";
const masksDir = "./masks";
const testMask = "./mask.png";

const tileColumns = 3;
const tileSize = 64;
const halfTileSize = tileSize / 2;

const tileSet: any = {};

const compositeMask = (png1: string, png2: string, mask: string, caseNumber: number) => {
    return new Promise((resolve, reject) => {
        let gmComposite = `gm composite ${path.join(tilesResizedDir, png1)} ${path.join(tilesResizedDir, png2)} ${path.join(masksDir, mask)} ${path.join(tilesOutDir, png1.slice(0, -4))}-${png2.slice(0, -4)}-case-${caseNumber}.png`;
        exec(gmComposite, function(err) {
            if (err) {
                throw err;
            }

            // pathUpdate(entryID, { thumb: thumb });
            resolve();
        });
    });
};

const nameCase = (imageName: string, caseNumber: number) => {
    return path.join(tilesOutDir, imageName.replace(".", `-case-${caseNumber}.`))
};

const cleanTmpDirectories = async () => {
    await fs.removeAsync(tilesResizedDir);
    await fs.removeAsync(tilesOutDir);

    await fs.mkdirAsync(tilesResizedDir);
    await fs.mkdirAsync(tilesOutDir);
};

const resizeTile = (png: string) => {
    return new Promise((resolve, reject) => {
        gm(path.join(tilesDir, png)).resize(tileSize, tileSize).write(path.join(tilesResizedDir, png), (err) => {
            if (err) {
                return reject(err);
            }

            return resolve();
        });
    });
};

const resizeTiles = async () => {
    const files = await fs.readdirAsync(tilesDir);

    const pngFiles = _.filter(files, (object) => {
        return object.split(".")[1] === "png";
    });

    for (const png of pngFiles) {
        await resizeTile(png);
    }
};

const generateCases = async () => {
    const files = await fs.readdirAsync(tilesResizedDir);

    const pngFiles = _.sortBy(_.filter(files, (object) => {
        return object.split(".")[1] === "png";
    }), (object) => {
        return +object.split(".")[0];
    });

    const masks = await fs.readdirAsync(masksDir);

    const maskFiles = _.sortBy(_.filter(masks, (object) => {
        return object.split(".")[1] === "png";
    }), (object) => {
        return +object.split(".")[0];
    });

    const doneFiles: string[] = [];
    for (const png of pngFiles) {
        for (const otherPng of pngFiles) {
            if (!(png === otherPng || doneFiles.indexOf(`${png}-${otherPng}`) !== -1 || doneFiles.indexOf(`${otherPng}-${png}`) !== -1)) {
                doneFiles.push(`${png}-${otherPng}`);

                // 16 cases
                for (const mask of maskFiles) {
                    const caseNumber = +mask.split(".")[0];
                    await compositeMask(png, otherPng, mask, caseNumber);
                }
            }
        }
    }
};

const joinImagesToTileset = async () => {
    const files = await fs.readdirAsync(tilesOutDir);

    const pngFiles = _.sortBy(_.sortBy(_.sortBy(_.filter(files, (object) => {
        return object.split(".")[1] === "png";
    }), (object) => {
        return +object.split(".")[0].split("-")[3];
    }), (object) => {
        return +object.split(".")[0].split("-")[1];
    }), (object) => {
        return +object.split(".")[0].split("-")[0];
    });

    console.log(`sorted`, pngFiles);

    const gmState = (<any>gm)();
    _.each(pngFiles, (png, i: number) => {
        const row = Math.floor(i / tileColumns);
        const column = i % tileColumns;
        gmState.in('-page', `+${column * tileSize}+${row * tileSize}`).in(path.join(tilesOutDir, png));
    });

    return new Promise((resolve, reject) => {
        gmState.mosaic().write("./tileset-out.png", (err: Error) => {
            resolve();
        });
    });
};

const run = async () => {
    console.log(`${_.upperFirst("cleaning")}.`);
    await cleanTmpDirectories();

    console.log(`${_.upperFirst("resizing")}.`);
    await resizeTiles();

    console.log(`${_.upperFirst("generating")}.`);
    await generateCases();

    console.log(`${_.upperFirst("joining")}.`);
    await joinImagesToTileset();
    console.log(`${_.upperFirst("done")}.`);
};

run();
