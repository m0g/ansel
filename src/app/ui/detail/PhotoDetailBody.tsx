import React from 'react'
import classnames from 'classnames'
import { ResizeSensor, IResizeEntry, Spinner, NonIdealState, Classes, Button } from '@blueprintjs/core'
import { FaRegCircle } from 'react-icons/fa'

import { PhotoWork, PhotoSectionId, Photo } from 'common/CommonTypes'
import { msg } from 'common/i18n/i18n'
import { CameraMetrics, CameraMetricsBuilder, RequestedPhotoPosition, PhotoPosition } from 'common/util/CameraMetrics'
import { Size, zeroSize, Insets, zeroInsets, Rect } from 'common/util/GeometryTypes'
import { bindMany, isShallowEqual } from 'common/util/LangUtil'

import { LibrarySelectionController } from 'app/controller/LibrarySelectionController'
import { PhotoActionController } from 'app/controller/PhotoActionController'
import { isPhotoSelected } from 'app/state/selectors'
import { SelectionState } from 'app/state/StateTypes'
import RedCheckCircle from 'app/ui/widget/icon/RedCheckCircle'
import PhotoActionButtons from 'app/ui/widget/PhotoActionButtons'

import CropModeLayer from './CropModeLayer'
import { DetailMode } from './DetailTypes'
import PhotoLayer, { PhotoLayerLoadingState } from './PhotoLayer'
import ViewModeLayer from './ViewModeLayer'

import './PhotoDetailBody.less'

import {movePhotosToTrash} from 'app/util/PhotoUtil'

export const cropModeInsets: Insets = { left: 60, right: 80, top: 60, bottom: 60 }


export interface Props {
    className?: any
    style?: any
    topBarClassName: string
    bodyClassName: string
    devicePixelRatio: number
    selection: SelectionState | null
    isActive: boolean
    mode: DetailMode
    isShowingInfo: boolean
    sectionId: PhotoSectionId
    photo: Photo
    isFirst: boolean
    isLast: boolean
    imagePath: string
    imagePathPrev: string | null
    imagePathNext: string | null
    photoWork: PhotoWork | null
    photoActionController: PhotoActionController
    librarySelectionController: LibrarySelectionController
    setMode(mode: DetailMode): void
    setPreviousDetailPhoto(): void
    setNextDetailPhoto(): void
    toggleShowInfo(): void
    closeDetail(): void
}

interface State {
    prevMode: DetailMode | null
    prevImagePath: string | null
    prevPhotoWork: PhotoWork | null
    loadingState: PhotoLayerLoadingState | null
    /** The size of the detail body (in px) */
    bodySize: Size
    textureSize: Size | null
    boundsRect: Rect | null
    photoPosition: RequestedPhotoPosition
    /** The PhotoWork which is changed in crop mode but not yet saved */
    editedPhotoWork: PhotoWork | null
    cameraMetricsBuilder: CameraMetricsBuilder
    cameraMetrics: CameraMetrics | null
}

export default class PhotoDetailBody extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onLoadingStateChange', 'onResize', 'onTextureChange', 'onTogglePhotoSelected', 
            'setPhotoPosition', 'enterCropMode', 'onPhotoWorkEdited', 'onCropDone', "moveToTrash")
        const cameraMetricsBuilder = new CameraMetricsBuilder()
        this.state = {
            prevMode: null,
            prevImagePath: null,
            prevPhotoWork: null,
            loadingState: null,
            bodySize: zeroSize,
            textureSize: null,
            boundsRect: null,
            photoPosition: 'contain',
            editedPhotoWork: null,
            cameraMetricsBuilder,
            cameraMetrics: null,
        }
    }

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        const { cameraMetricsBuilder } = prevState
        let nextState: Partial<State> | null = null
        let nextBoundsRect = prevState.boundsRect
        let nextPhotoPosition = prevState.photoPosition
        let nextEditedPhotoWork = prevState.editedPhotoWork

        if (nextProps.imagePath !== prevState.prevImagePath) {
            nextState = { prevImagePath: nextProps.imagePath, textureSize: null, photoPosition: 'contain' }
        }

        if (nextProps.mode !== prevState.prevMode) {
            const isCropMode = nextProps.mode === 'crop'
            cameraMetricsBuilder
                .setInsets(isCropMode ? cropModeInsets : zeroInsets)
            nextBoundsRect = null
            nextState = { ...nextState, prevMode: nextProps.mode, boundsRect: nextBoundsRect }
            if (isCropMode) {
                nextPhotoPosition = 'contain'
                nextState.photoPosition = nextPhotoPosition
            }
        }

        if (nextProps.photoWork !== prevState.prevPhotoWork) {
            nextEditedPhotoWork = null
            nextPhotoPosition = 'contain'
            nextState = {
                ...nextState,
                prevPhotoWork: nextProps.photoWork,
                photoPosition: nextPhotoPosition,
                editedPhotoWork: nextEditedPhotoWork
            }
        }

        if (prevState.textureSize && nextProps.photoWork) {
            const cameraMetrics = cameraMetricsBuilder
                .setTextureSize(prevState.textureSize)
                .setDisplaySize(prevState.bodySize, 1 / nextProps.devicePixelRatio)
                .setBoundsRect(nextBoundsRect)
                .setPhotoWork(nextEditedPhotoWork || nextProps.photoWork)
                .setPhotoPosition(nextPhotoPosition)
                .getCameraMetrics()
            if (cameraMetrics !== prevState.cameraMetrics) {
                nextState = { ...nextState, cameraMetrics }
            }
        } else if (prevState.cameraMetrics) {
            nextState = { ...nextState, cameraMetrics: null }
        }

        return nextState
    }

    private onLoadingStateChange(loadingState: PhotoLayerLoadingState) {
        this.setState({ loadingState })
    }

    private onResize(entries: IResizeEntry[]) {
        const { state } = this
        const contentRect = entries[0].contentRect
        if (state.bodySize.width !== contentRect.width || state.bodySize.height !== contentRect.height) {
            const bodySize: Size = { width: contentRect.width, height: contentRect.height }
            this.setState({ bodySize })
        }
    }

    private onTextureChange(textureSize: Size | null) {
        const { state } = this
        if (!isShallowEqual(textureSize, state.textureSize)) {
            this.setState({ textureSize })
        }
    }

    private onTogglePhotoSelected() {
        const { props } = this
        const isSelected = isPhotoSelected(props.sectionId, props.photo.id, props.selection)
        props.librarySelectionController.setPhotoSelected(props.sectionId, props.photo.id, !isSelected)
    }

    private setPhotoPosition(photoPosition: PhotoPosition) {
        this.setState({ photoPosition })
    }

    private enterCropMode() {
        this.props.setMode('crop')
    }

    private onPhotoWorkEdited(photoWork: PhotoWork, boundsRect?: Rect | null) {
        this.setState({ editedPhotoWork: photoWork, boundsRect: boundsRect || null })
    }

    private onCropDone() {
        const { editedPhotoWork } = this.state
        if (editedPhotoWork) {
            this.props.photoActionController.updatePhotoWork(this.props.photo, photoWork => {
                for (const key of Object.keys(photoWork)) {
                    delete photoWork[key]
                }
                for (const key of Object.keys(editedPhotoWork)) {
                    photoWork[key] = editedPhotoWork[key]
                }
            })
        }

        // NOTE: editedPhotoWork will be set to null when the new photoWork is set.
        //       This is important in order to avoid flickering (the old photoWork would be shown for a short time).
        this.props.setMode('view')
    }

    private moveToTrash() { 
        const {props} = this
        movePhotosToTrash(props.photo, props.photoActionController)
    }

    render() {
        const { props, state } = this
        const isSelected = isPhotoSelected(props.sectionId, props.photo.id, props.selection)
        return (
            <div className={classnames(props.className, 'PhotoDetailBody')}>
                <ResizeSensor onResize={this.onResize}>
                    <div className={classnames(props.bodyClassName, 'PhotoDetailBody-sizer')} />
                </ResizeSensor>
                <PhotoLayer
                    className={props.bodyClassName}
                    mode={props.mode}
                    bodySize={state.bodySize}
                    imagePath={props.imagePath}
                    imagePathPrev={props.imagePathPrev}
                    imagePathNext={props.imagePathNext}
                    cameraMetrics={state.cameraMetrics}
                    onLoadingStateChange={this.onLoadingStateChange}
                    onTextureChange={this.onTextureChange}
                />
                {props.mode === 'view' &&
                    <ViewModeLayer
                        topBarClassName={props.topBarClassName}
                        bodyClassName={props.bodyClassName}
                        inSelectionMode={!!props.selection}
                        isTopBarRight={!props.isShowingInfo}
                        topBarRightItem={
                            props.selection ? (
                                <Button
                                    className='PhotoDetailBody-toggleSelected'
                                    intent='primary'
                                    active={isSelected}
                                    icon={isSelected ? <RedCheckCircle size={16}/> : <FaRegCircle style={{ fontSize: 16 }}/>}
                                    text={msg(isSelected ? 'PhotoDetailBody_selected' : 'PhotoDetailBody_select')}
                                    onClick={this.onTogglePhotoSelected}
                                />
                            ) : (
                                <PhotoActionButtons
                                    selectedPhotos={props.photo}
                                    isShowingTrash={!!props.photo.trashed}
                                    isShowingInfo={props.isShowingInfo}
                                    photoActionController={props.photoActionController}
                                    toggleShowInfo={props.toggleShowInfo}
                                />
                            )
                        }
                        showEditButton={!props.selection}
                        isActive={props.isActive}
                        isFirst={props.isFirst}
                        isLast={props.isLast}
                        cameraMetrics={state.cameraMetrics}
                        setPreviousDetailPhoto={props.setPreviousDetailPhoto}
                        setNextDetailPhoto={props.setNextDetailPhoto}
                        setPhotoPosition={this.setPhotoPosition}
                        togglePhotoSelected={this.onTogglePhotoSelected}
                        enterCropMode={this.enterCropMode}
                        closeDetail={props.closeDetail}
                        movePhotosToTrash={this.moveToTrash}
                    />
                }
                {props.mode === 'crop' && props.photoWork && state.cameraMetrics &&
                    <CropModeLayer
                        topBarClassName={props.topBarClassName}
                        bodyClassName={props.bodyClassName}
                        photoWork={state.editedPhotoWork || props.photoWork}
                        cameraMetrics={state.cameraMetrics}
                        onPhotoWorkEdited={this.onPhotoWorkEdited}
                        onDone={this.onCropDone}
                    />
                }
                {state.loadingState === 'loading' &&
                    <div className={props.bodyClassName}>
                        <Spinner
                            className='PhotoDetailBody-spinner'
                            size={Spinner.SIZE_LARGE}
                        />
                    </div>
                }
                {this.renderError()}
            </div>
        )
    }

    private renderError() {
        const { props, state } = this
        if (state.loadingState === 'error-notExisting' || state.loadingState === 'error-loading') {
            const isPhotoMissing = state.loadingState === 'error-notExisting'
            return (
                <div className={props.bodyClassName}>
                    <NonIdealState
                        className={classnames('PhotoDetailBody-error', Classes.DARK)}
                        icon={isPhotoMissing ? 'delete' : 'disable'}
                        title={msg(isPhotoMissing ? 'common_error_photoNotExisting' : 'PhotoDetailBody_error_loadingFailed')}
                        description={msg(isPhotoMissing ? 'common_error_photoNotExisting_desc' : 'PhotoDetailBody_error_loadingFailed_desc')}
                    />
                </div>
            )
        }
    }

}
