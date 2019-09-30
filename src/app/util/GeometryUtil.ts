import { mat4, vec2 } from 'gl-matrix'

import { round } from 'common/util/LangUtil'

import { Point, Rect, Corner } from './GeometryTypes'


export type VectorLike = vec2 | [ number, number ]

export const oppositeCorner: { [K in Corner]: Corner } = {
    nw: 'se',
    ne: 'sw',
    sw: 'ne',
    se: 'nw'
}

export const horizontalAdjacentCorner: { [K in Corner]: Corner } = {
    nw: 'ne',
    ne: 'nw',
    sw: 'se',
    se: 'sw'
}

export const verticalAdjacentCorner: { [K in Corner]: Corner } = {
    nw: 'sw',
    ne: 'se',
    sw: 'nw',
    se: 'ne'
}

export function vectorFromPoint(point: Point): vec2 {
    return vec2.fromValues(point.x, point.y)
}

export function roundPoint(point: Point, fractionDigits: number = 0): Point {
    return {
        x: round(point.x, fractionDigits),
        y: round(point.y, fractionDigits)
    }
}

export function roundVector(vector: VectorLike, fractionDigits: number = 0): vec2 {
    return vec2.fromValues(
        round(vector[0], fractionDigits),
        round(vector[1], fractionDigits)
    )
}

export function transformRect(rect: Rect, matrix: mat4): Rect {
    const vector1 = getCornerVectorOfRect(rect, 'nw')
    vec2.transformMat4(vector1, vector1, matrix)
    const vector2 = getCornerVectorOfRect(rect, 'se')
    vec2.transformMat4(vector2, vector2, matrix)
    return getRectFromVectors(vector1, vector2)
}

export function transformPoint(point: Point, matrix: mat4): Point {
    const vec = vec2.fromValues(point.x, point.y)
    vec2.transformMat4(vec, vec, matrix)
    return { x: vec[0], y: vec[1] }
}

export function getRectFromPoints(point1: Point, point2: Point): Rect {
    return {
        x: Math.min(point1.x, point2.x),
        y: Math.min(point1.y, point2.y),
        width: Math.abs(point1.x - point2.x),
        height: Math.abs(point1.y - point2.y)
    }
}

export function getRectFromVectors(vector1: VectorLike, vector2: VectorLike): Rect {
    return {
        x: Math.min(vector1[0], vector2[0]),
        y: Math.min(vector1[1], vector2[1]),
        width: Math.abs(vector1[0] - vector2[0]),
        height: Math.abs(vector1[1] - vector2[1])
    }
}

export function getCornerPointOfRect(rect: Rect, corner: Corner): Point {
    const x = (corner === 'nw' || corner === 'sw') ? rect.x : (rect.x + rect.width)
    const y = (corner === 'nw' || corner === 'ne') ? rect.y : (rect.y + rect.height)
    return { x, y }
}

export function getCornerVectorOfRect(rect: Rect, corner: Corner): vec2 {
    const x = (corner === 'nw' || corner === 'sw') ? rect.x : (rect.x + rect.width)
    const y = (corner === 'nw' || corner === 'ne') ? rect.y : (rect.y + rect.height)
    return vec2.fromValues(x, y)
}

export function intersectVectorLines(start1: VectorLike, end1: VectorLike, start2: VectorLike, end2: VectorLike, outFactors: number[]) {
    intersectPlainLines(start1[0], start1[1], end1[0], end1[1], start2[0], start2[1], end2[0], end2[1], outFactors)
}

export function intersectPlainLines(startX1: number, startY1: number, endX1: number, endY1: number,
    startX2: number, startY2: number, endX2: number, endY2: number,
    outFactors: number[])
{
    const vX1 = endX1 - startX1, vY1 = endY1 - startY1
    const vX2 = endX2 - startX2, vY2 = endY2 - startY2
    const f = vX2*vY1 - vX1*vY2
    if (f == 0) {
        outFactors[0] = NaN
        outFactors[1] = NaN
    } else {
        const vX3 = startX2 - startX1, vY3 = startY2 - startY1
        outFactors[0] = (vX2*vY3 - vX3*vY2)/f
        outFactors[1] = (vX1*vY3 - vX3*vY1)/f
    }
}

export function isVectorInPolygon(point: VectorLike, polygonPoints: VectorLike[]): boolean {
    // Original code from: https://github.com/substack/point-in-polygon/blob/master/index.js
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    let x = point[0], y = point[1]

    let inside = false
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const xi = polygonPoints[i][0], yi = polygonPoints[i][1]
        const xj = polygonPoints[j][0], yj = polygonPoints[j][1]

        const intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
    }

    return inside
}

const epsilon = 0.0000001

/**
 * Returns the first cut point of a line with a polygon.
 * If `lineStart` is in the polygon, this is the point where the line hits the polygon for the first time when going
 * from `lineStart` to `lineEnd` and beyond.
 * If `lineStart` is outside the polygon, this is the first cut point before `lineStart`.
 * Returns `null` if the line doesn't hit the polygon at all.
 */
export function cutLineWithPolygon(lineStart: VectorLike, lineEnd: VectorLike, polygonPoints: VectorLike[],
    outFactor?: number[]): vec2 | null
{
    let bestFactor: number | null = null
    const outFactors: number[] = []
    const polygonSize = polygonPoints.length
    for (let i = 0, j = polygonSize - 1; i < polygonSize; j = i++) {
        const segmentStart = polygonPoints[i]
        const segmentEnd = polygonPoints[j]
        intersectVectorLines(segmentStart, segmentEnd, lineStart, lineEnd, outFactors)
        if (outFactors[0] >= 0 && outFactors[0] <= 1) {
            // The line cuts this segment
            if (bestFactor === null || ((outFactors[1] >= epsilon && bestFactor >= epsilon) ? outFactors[1] < bestFactor : outFactors[1] > bestFactor)) {
                bestFactor = outFactors[1]
            }
        }
    }

    if (outFactor) {
        outFactor[0] = (bestFactor === null) ? NaN : bestFactor
    }

    if (bestFactor === null) {
        return null
    } else {
        return vec2.fromValues(
            lineStart[0] + bestFactor * (lineEnd[0] - lineStart[0]),
            lineStart[1] + bestFactor * (lineEnd[1] - lineStart[1])
        )
    }
}
