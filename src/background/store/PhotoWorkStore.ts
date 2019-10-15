import fs from 'fs'
import readline from 'readline'
import stringify from 'json-stringify-pretty-compact'
import { mat4, vec2 } from 'gl-matrix'

import { Photo, PhotoWork, ExifOrientation } from 'common/CommonTypes'
import { createProjectionMatrix } from 'common/util/CameraMetrics'
import { rotate } from 'common/util/EffectsUtil'
import { assertMainProcess } from 'common/util/ElectronUtil'
import { Rect } from 'common/util/GeometryTypes'
import { scaleRectToFitBorders, centerOfRect, Vec2Like, cornerPointOfRect, rectFromPoints } from 'common/util/GeometryUtil'
import { parsePath } from 'common/util/TextUtil'

import { fsExists, fsUnlink, fsWriteFile, fsReadFile } from 'background/util/FileUtil'


declare global {
    interface JSON {
        parse(text: Buffer, reviver?: (key: any, value: any) => any): any
    }
}


assertMainProcess()


/** The data as it is stored in ansel.json */
interface DirectoryWorkData {
    photos: { [key:string]: PhotoWork }
}

/** The rules of a picasa.ini for one photo */
type PicasaRules = string[]

/** Data parsed from picasa.ini */
interface PicasaData {
    photos: { [key:string]: PicasaRules }
}

/** All work data we have about one directory */
interface DirectoryData {
    anselData: DirectoryWorkData,
    picasaData?: PicasaData
}


const refetchInterval = 30000
const storeDelay = 2000


class DirectoryWork {

    private data: DirectoryData | null = null
    private lastFetchTime: number = 0
    private runningFetch: Promise<DirectoryData> | null = null
    private isStoreRunning: boolean = false
    private needsStoreFollowup: boolean = false


    constructor(public directoryPath: string) {
    }


    public isIdle(): boolean {
        return !this.runningFetch && !this.isStoreRunning && !this.needsStoreFollowup
    }


    private async fetchData(): Promise<DirectoryData> {
        if (this.data && (this.isStoreRunning || this.needsStoreFollowup || Date.now() < this.lastFetchTime + refetchInterval)) {
            return this.data
        } else if (this.runningFetch) {
            return this.runningFetch
        } else {
            this.runningFetch = Promise.all(
                [
                    fetchAnselJson(this.directoryPath),
                    fetchPicasaIni(this.directoryPath)
                ])
                .then(results => {
                    const [ anselData, picasaData ] = results
                    return { anselData, picasaData: picasaData || undefined }
                })

            this.runningFetch.then(
                data => {
                    this.data = data
                    this.lastFetchTime = Date.now()
                    this.runningFetch = null
                },
                error => {
                    this.runningFetch = null
                })

            return this.runningFetch
        }
    }

    public async fetchPhotoWork(photoBasename: string, masterWidth: number, masterHeight: number): Promise<PhotoWork> {
        const data = await this.fetchData()

        let photoWork = data.anselData.photos[photoBasename]

        if (!photoWork && data.picasaData) {
            const picasaRules = data.picasaData.photos[photoBasename]
            if (picasaRules) {
                photoWork = createPhotoWorkFromPicasaRules(picasaRules, this.directoryPath, photoBasename, masterWidth, masterHeight)
            }
        }

        return photoWork || {}
    }

    public async storePhotoWork(photoBasename: string, photoWork: PhotoWork) {
        // Why `toCanonical`?
        // We store the photos in canonical order (with sorted keys) so a `ansel.json` file produces less conflicts when version controlled.

        const data = await this.fetchData()
        const anselData = data.anselData

        const isEmpty = Object.keys(photoWork).length === 0
        if (isEmpty) {
            delete anselData.photos[photoBasename]
        } else {
            photoWork = toCanonical(photoWork)
            anselData.photos[photoBasename] = photoWork

            const isNew = !anselData.photos[photoBasename]
            if (isNew) {
                // This is a new photo
                // -> We have to sort the keys
                anselData.photos = toCanonical(anselData.photos)
            }
        }

        this.onDataChanged()
    }

    private onDataChanged() {
        if (this.isStoreRunning) {
            this.needsStoreFollowup = true
            return
        }

        this.isStoreRunning = true
        const directoryWorkFile = this.directoryPath + '/ansel.json'
        const storePromise =
            (async () => {
                await new Promise(resolve => setTimeout(resolve, storeDelay))
                this.needsStoreFollowup = false
                const anselData = this.data && this.data.anselData
                const isEmpty = !anselData || Object.keys(anselData.photos).length === 0
                if (isEmpty) {
                    if (await fsExists(directoryWorkFile)) {
                        await fsUnlink(directoryWorkFile)
                        console.log('Removed empty ' + directoryWorkFile)
                    }
                } else {
                    const json = stringify(anselData)
                    await fsWriteFile(directoryWorkFile, json)
                    console.log('Stored ' + directoryWorkFile)
                }
            })()
            .then(() => {
                this.isStoreRunning = false
                if (this.needsStoreFollowup) {
                    this.onDataChanged()
                }
            },
            error => {
                this.isStoreRunning = false
                console.error('Storing directory work failed: ' + this.directoryPath, error)
            })
    }

}


async function fetchAnselJson(directoryPath: string): Promise<DirectoryWorkData> {
    const directoryWorkFile = directoryPath + '/ansel.json'
    if (! await fsExists(directoryWorkFile)) {
        return { photos: {} }
    } else {
        const buffer = await fsReadFile(directoryWorkFile)
        const anselData = JSON.parse(buffer) as DirectoryWorkData
        console.log('Fetched ' + directoryWorkFile)
        return anselData
    }
}


const sectionStartRegExp = /^\[(.*)\]$/

async function fetchPicasaIni(directoryPath: string): Promise<PicasaData | null> {
    let picasaFile = directoryPath + '/.picasa.ini'
    if (! await fsExists(picasaFile)) {
        picasaFile = directoryPath + '/Picasa.ini'
        if (! await fsExists(picasaFile)) {
            return null
        }
    }

    let editedPicasaData: PicasaData | null = null
        // The picasa data of the edited images of which this directory holds the originals
    const directoryParts = parsePath(directoryPath)
    if (directoryParts.base === '.picasaoriginals' || directoryParts.base === 'Originals') {
        // This is a Picasa originals directory
        // -> Fetch the `.picasa.ini` of the parent directory (which holds the edited versions of the originals in this directory)
        editedPicasaData = await fetchPicasaIni(directoryParts.dir)
    }

    return await new Promise<PicasaData>(
        (resolve, reject) => {
            const picasaData: PicasaData = { photos: {} }

            const lineReader = readline.createInterface({
                input: fs.createReadStream(picasaFile)
            })

            let currentSectionKey: string | null = null
            let currentSectionRules: string[] = []

            function flushCurrentSection() {
                if (currentSectionKey) {
                    const editedSectionRules = editedPicasaData && editedPicasaData.photos[currentSectionKey]
                    if (editedSectionRules) {
                        currentSectionRules.push(...editedSectionRules)
                    }

                    picasaData.photos[currentSectionKey] = currentSectionRules
                    currentSectionKey = null
                    currentSectionRules = []
                }
            }

            lineReader.on('line', line => {
                try {
                    const match = sectionStartRegExp.exec(line)
                    if (match) {
                        flushCurrentSection()
                        currentSectionKey = match[1]
                    } else {
                        currentSectionRules.push(line)
                    }
                } catch (error) {
                    reject(error)
                }
            })
            lineReader.on('close', () => {
                try {
                    flushCurrentSection()
                    console.log('Fetched ' + picasaFile)
                    resolve(picasaData)
                } catch (error) {
                    reject(error)
                }
            })
        })
}


const rotateRuleRegExp = /^rotate=rotate\((\d+)\)$/
const filtersRuleRegExp = /^filters=(.*)$/
const cropRuleRegExp = /^crop=rect64\(([0-9a-f]+)\)$/
const ignoredRulesRegExp = /^([ \t]*$|backuphash=|width=|height=|moddate=|textactive=0)/

const tiltFilterRegExp = /^tilt=1,([-0-9.]+),0.0*$/
const cropFilterRegExp = /^crop64=1,([0-9a-f]+)$/

function createPhotoWorkFromPicasaRules(picasaRules: PicasaRules, directoryPath: string, photoBasename: string,
    masterWidth: number, masterHeight: number): PhotoWork
{
    // For information about picasa.ini see:
    //   - https://gist.github.com/fbuchinger/1073823

    const photoWork: PhotoWork = {}

    let importProblems: string[] = []

    let match: RegExpMatchArray | null = null
    let picasaCropRect: string | null = null
    for (const rule of picasaRules) {
        if (match = rotateRuleRegExp.exec(rule)) {
            rotate(photoWork, parseInt(match[1]), false)
        } else if (rule == 'star=yes') {
            photoWork.flagged = true
        } else if (match = filtersRuleRegExp.exec(rule)) {
            const filterSplits = match[1].split(';')
            for (const filter of filterSplits) {
                if (match = tiltFilterRegExp.exec(filter)) {
                    const picasaTilt = parseFloat(match[1])
                    photoWork.tilt = (photoWork.tilt || 0) + picasaTilt * -11.3848
                        // For formula see: doc/picasa-ini-format.md
                } else if (match = cropFilterRegExp.exec(filter)) {
                    if (!picasaCropRect) {
                        picasaCropRect = match[1]
                    } else if (picasaCropRect !== match[1]) {
                        importProblems.push(`Duplicate crop rects: ${picasaCropRect} and ${match[1]}`)
                    }
                } else if (filter.length) {
                    importProblems.push('Unknown filter: ' + filter)
                }
            }
        } else if (match = cropRuleRegExp.exec(rule)) {
            if (!picasaCropRect) {
                picasaCropRect = match[1]
            } else if (picasaCropRect !== match[1]) {
                importProblems.push(`Duplicate crop rects: ${picasaCropRect} and ${match[1]}`)
            }
        } else if (! ignoredRulesRegExp.test(rule)) {
            // Unknown rule
            importProblems.push('Unknown rule: ' + rule)
        }
    }

    if (picasaCropRect || photoWork.tilt) {
        // Picasa works in the opposite order like we do: Picasa first crops the original image, then in tilts it and
        // shrinks it to fit into the borders of the cropped image while keeping the aspect ratio.
        // For details see: doc/picasa-ini-format.md

        let picasaCanvasRect: Rect | null = null
        if (picasaCropRect) {
            if (picasaCropRect.length > 16) {
                importProblems.push('Invalid crop rect (length > 16): ' + picasaCropRect)
            } else {
                while (picasaCropRect.length < 16) {
                    picasaCropRect = '0' + picasaCropRect
                }
                picasaCanvasRect = rectFromPoints(
                    [
                        parseInt(picasaCropRect.substring(0, 4), 16) / 0xffff * masterWidth,
                        parseInt(picasaCropRect.substring(4, 8), 16) / 0xffff * masterHeight
                    ], [
                        parseInt(picasaCropRect.substring(8, 12), 16) / 0xffff * masterWidth,
                        parseInt(picasaCropRect.substring(12, 16), 16) / 0xffff * masterHeight
                    ])
            }
        }
        if (!picasaCanvasRect) {
            picasaCanvasRect = {
                x:      0,
                y:      0,
                width:  masterWidth,
                height: masterHeight
            }
        }

        const exifOrientation = ExifOrientation.Up
            // masterWidth and masterHeight have already EXIF orientation applied, so we use "Up" here
        const projectionMatrix = createProjectionMatrix({ width: masterWidth, height: masterHeight }, exifOrientation, photoWork)
        const borderPolygon: Vec2Like[] = [
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'nw'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'ne'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'se'), projectionMatrix),
            vec2.transformMat4(vec2.create(), cornerPointOfRect(picasaCanvasRect, 'sw'), projectionMatrix)
        ]
        const projectedCropRectCenter = vec2.transformMat4(vec2.create(), centerOfRect(picasaCanvasRect), projectionMatrix)
        const projectedCropRectSize = (photoWork.rotationTurns === 1 || photoWork.rotationTurns === 3) ?
            { width: picasaCanvasRect.height, height: picasaCanvasRect.width } :
            picasaCanvasRect
        photoWork.cropRect = scaleRectToFitBorders(projectedCropRectCenter, projectedCropRectSize, borderPolygon)
    }

    if (importProblems.length) {
        let msg = `Picasa import is incomplete for ${directoryPath}/${photoBasename}:`
        for (const problem of importProblems) {
            msg += '\n  - ' + problem
        }
        console.warn(msg)
    }

    return photoWork
}


function toCanonical<T extends { [key:string]: any }>(obj: T): T {
    const sortedKeys = Object.keys(obj).sort()
    const sortedObj = {}
    for (const key of sortedKeys) {
        sortedObj[key] = obj[key]
    }
    return sortedObj as T
}


const directoryWorkByPath: { [key:string]: DirectoryWork } = {}
let directoryWorkCacheSize = 0
const maxDirectoryWorkCacheSize = 100

function getDirectoryWork(directoryPath: string): DirectoryWork {
    let directoryWork = directoryWorkByPath[directoryPath]
    if (!directoryWork) {
        if (directoryWorkCacheSize >= maxDirectoryWorkCacheSize) {
            for (const path of Object.keys(directoryWorkByPath)) {
                const cachedDirectoryWork = directoryWorkByPath[path]
                if (cachedDirectoryWork.isIdle()) {
                    delete directoryWorkByPath[path]
                    directoryWorkCacheSize--
                }
            }
        }

        directoryWork = new DirectoryWork(directoryPath)
        directoryWorkByPath[directoryPath] = directoryWork
        directoryWorkCacheSize++
    }
    return directoryWork
}


export async function fetchPhotoWorkOfPhoto(photo: Photo): Promise<PhotoWork> {
    return fetchPhotoWork(photo.master_dir, photo.master_filename, photo.master_width, photo.master_height)
}

export async function fetchPhotoWork(photoDir: string, photoFileName: string, masterWidth: number, masterHeight: number):
    Promise<PhotoWork>
{
    return getDirectoryWork(photoDir)
        .fetchPhotoWork(photoFileName, masterWidth, masterHeight)
}


export async function storePhotoWork(photoDir: string, photoFileName: string, photoWork: PhotoWork): Promise<void> {
    return getDirectoryWork(photoDir)
        .storePhotoWork(photoFileName, photoWork)
}


export async function removePhotoWork(photoDir: string, photoFileName: string): Promise<void> {
    await storePhotoWork(photoDir, photoFileName, {})
}
