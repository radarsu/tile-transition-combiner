import _ = require("lodash");
import fs = require("fs-extra-promise");
import gm = require("gm");
import path = require("path");
import child_process = require("child_process");
const exec = child_process.exec;

const tilesDir = "./tiles";
const tilesResizedDir = "./tiles-resized";
const tilesOutDir = "./tiles-out";
const tilePalettesDir = "./tile-palettes";
const masksDir = "./masks";
const testMask = "./mask.png";

const tileColumns = 3;
const tileSize = 64;
const maxPalette = 510;
const halfTileSize = tileSize / 2;

const compositeMask = (png1: string, png2: string, mask: string, caseNumber: number) => {
    return new Promise((resolve, reject) => {
        const gmComposite = `gm composite ${path.join(tilesResizedDir, png1)} ${path.join(tilesResizedDir, png2)} ${path.join(masksDir, mask)} ${path.join(tilesOutDir, png1.slice(0, -4))}-${png2.slice(0, -4)}-case-${caseNumber}.png`;
        exec(gmComposite, (err) => {
            if (err) {
                throw err;
            }

            resolve();
        });
    });
};

const nameCase = (imageName: string, caseNumber: number) => {
    return path.join(tilesOutDir, imageName.replace(".", `-case-${caseNumber}.`))
};

const cleanTmpDirectories = async () => {
    const cleanDirs = [tilesResizedDir, tilesOutDir, tilePalettesDir];

    for (const dir of cleanDirs) {
        await fs.removeAsync(dir);
        await fs.mkdirAsync(dir);
    }
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

const joinPalette = (gmState: any, paletteNumber: number) => {
    return new Promise((resolve, reject) => {
        gmState.mosaic().write(path.join(tilePalettesDir, `${paletteNumber}.png`), (err: Error) => {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
};

const joinImagesToPalettes = async () => {
    const files = await fs.readdirAsync(tilesOutDir);

    const pngFiles = _.sortBy(_.sortBy(_.sortBy(_.filter(files, (object) => {
        return object.split(".")[1] === "png";
    }), (object) => {
        return +object.split(".")[0].split("-")[3];
    }), (object) => {
        return +object.split(".")[0].split("-")[0];
    }), (object) => {
        return +object.split(".")[0].split("-")[1];
    });

    let gmState = (<any>gm)();
    let maxCounter = 0;
    let paletteNumber = 0;
    for (const attr in pngFiles) {
        const png = pngFiles[attr];

        const row = Math.floor(maxCounter / tileColumns);
        const column = maxCounter % tileColumns;
        gmState.in('-page', `+${column * tileSize}+${row * tileSize}`).in(path.join(tilesOutDir, png));

        ++maxCounter;

        if (maxCounter === maxPalette) {
            await joinPalette(gmState, paletteNumber++);
            // prepare for new palette
            gmState = (<any>gm)();
            maxCounter = 0;
        }
    }

    if (maxCounter > 0) {
        await joinPalette(gmState, paletteNumber);
    }
};

const joinPalettesToTileset = async () => {
    const files = await fs.readdirAsync(tilePalettesDir);

    const paletteFiles = _.sortBy(_.filter(files, (object) => {
        return object.split(".")[1] === "png";
    }), (object) => {
        return +object.split(".")[0];
    });

    let maxCounter = 0;
    let paletteNumber = 0;
    const gmState = (<any>gm)();
    _.each(paletteFiles, (png, i: number) => {
        console.log(png);
        // gmState.in('-page', `+0+${i * tileSize * maxCounter / 3}`).in(path.join(tilePalettesDir, png));
        gmState.append(path.join(tilePalettesDir, png));
    });

    return new Promise((resolve, reject) => {
        console.log(gmState);
        gmState.write("./tileset-out.png", (err: Error) => {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
};

const run = async () => {
    console.log(`${_.upperFirst("cleaning")}...`);
    await cleanTmpDirectories();

    console.log(`${_.upperFirst("resizing")}...`);
    await resizeTiles();

    console.log(`${_.upperFirst("generating")}...`);
    await generateCases();

    console.log(`${_.upperFirst("joining into palettes")}...`);
    await joinImagesToPalettes();

    console.log(`${_.upperFirst("joining into tileset")}...`);
    await joinPalettesToTileset();

    console.log(`${_.upperFirst("done")}.`);
};

run();
