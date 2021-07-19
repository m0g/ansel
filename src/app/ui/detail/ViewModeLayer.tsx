import classnames from 'classnames'
import React from 'react'
import { Button, ButtonGroup, MaybeElement, Slider } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import { CameraMetrics, RequestedPhotoPosition, limitPhotoPosition } from 'common/util/CameraMetrics'
import { bindMany } from 'common/util/LangUtil'

import FaIcon from 'app/ui/widget/icon/FaIcon'
import Toolbar from 'app/ui/widget/Toolbar'
import { Command, getCommandButtonProps, CommandGroupId, addCommandGroup, setCommandGroupEnabled, removeCommandGroup } from 'app/controller/HotkeyController'

import ViewModeOverlay from './ViewModeOverlay'


export interface Props {
    topBarClassName: string
    bodyClassName: string
    inSelectionMode: boolean
    isTopBarRight: boolean
    topBarRightItem?: MaybeElement
    showEditButton: boolean
    isActive: boolean
    isFirst: boolean
    isLast: boolean
    cameraMetrics: CameraMetrics | null
    setPreviousDetailPhoto: () => void
    setNextDetailPhoto: () => void
    setPhotoPosition(photoPosition: RequestedPhotoPosition): void
    togglePhotoSelected(): void
    enterCropMode(): void
    closeDetail(): void
    movePhotosToTrash(): void
}

type CommandKeys = 'close' | 'prevPhoto' | 'nextPhoto' | 'toggleSelected' | 'edit' | 'delete'

export default class ViewModeLayer extends React.Component<Props> {

    private commands: { [K in CommandKeys]: Command }
    private commandGroupId: CommandGroupId

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onZoomSliderChange')

        this.commands = {
            close: { combo: 'esc', label: msg('common_backToLibrary'), onAction: props.closeDetail },
            prevPhoto: { combo: 'left', enabled: () => !this.props.isFirst, label: msg('PhotoDetailPane_prevPhoto'), onAction: props.setPreviousDetailPhoto },
            nextPhoto: { combo: 'right', enabled: () => !this.props.isLast, label: msg('PhotoDetailPane_nextPhoto'), onAction: props.setNextDetailPhoto },
            toggleSelected: { combo: 'space', enabled: () => !!this.props.inSelectionMode, onAction: props.togglePhotoSelected },
            edit: { combo: 'enter', enabled: () => this.props.showEditButton, label: msg('PhotoDetailPane_edit'), onAction: props.enterCropMode },
            delete: { combo: 'del', enabled: () => true, onAction: props.movePhotosToTrash },
        }
    }

    componentDidMount() {
        this.commandGroupId = addCommandGroup(this.commands)
    }

    componentDidUpdate(prevProps: Props) {
        const { props } = this
        if (props.isActive !== prevProps.isActive) {
            setCommandGroupEnabled(this.commandGroupId, props.isActive)
        }
    }

    componentWillUnmount() {
        removeCommandGroup(this.commandGroupId)
    }

    private onZoomSliderChange(sliderScale: number) {
        const { cameraMetrics } = this.props
        if (!cameraMetrics) {
            return
        }

        const { minZoom, maxZoom } = cameraMetrics
        const percentage = fromSliderScale(sliderScale)
        const zoom = minZoom + percentage * (maxZoom - minZoom)

        this.props.setPhotoPosition((zoom <= minZoom) ? 'contain' :
            limitPhotoPosition(cameraMetrics, { ...cameraMetrics.photoPosition, zoom }, false))
    }

    render() {
        const { props, commands } = this
        const { cameraMetrics } = props

        let zoomSliderValue = 0
        let zoomSliderLabel: string | null = null
        if (cameraMetrics) {
            const zoom = cameraMetrics.photoPosition.zoom
            zoomSliderValue = toSliderScale((zoom - cameraMetrics.minZoom) / (cameraMetrics.maxZoom - cameraMetrics.minZoom))
            if (zoom > cameraMetrics.minZoom + 0.00001) {
                zoomSliderLabel = `${Math.round(zoom * 100)}%`
            }
        }

        return (
            <>
                <Toolbar
                    className={classnames(props.topBarClassName, 'ViewModeLayer-toolbar')}
                    isTopBar={true}
                    isLeft={true}
                    isRight={props.isTopBarRight}
                >
                    <Button onClick={commands.close.onAction}>
                        <FaIcon name="chevron-left"/>
                        <span>{commands.close.label}</span>
                    </Button>
                    <ButtonGroup>
                        <Button minimal={true} {...getCommandButtonProps(commands.prevPhoto)}>
                            <FaIcon name="arrow-left"/>
                        </Button>
                        <Button minimal={true} {...getCommandButtonProps(commands.nextPhoto)}>
                            <FaIcon name="arrow-right"/>
                        </Button>
                    </ButtonGroup>
                    <Toolbar.Spacer/>
                    <div className='PhotoDetailPane-zoomPane'>
                        <Slider className='PhotoDetailPane-zoomSlider'
                            disabled={cameraMetrics === null}
                            value={zoomSliderValue}
                            min={0}
                            max={1}
                            stepSize={0.000001}
                            labelRenderer={false}
                            showTrackFill={false}
                            onChange={this.onZoomSliderChange}
                        />
                        <div className='PhotoDetailPane-zoomValue'>{zoomSliderLabel}</div>
                    </div>
                    {props.showEditButton &&
                        <Button minimal={true} {...getCommandButtonProps(commands.edit)}>
                            <FaIcon name='crop'/>
                        </Button>
                    }
                    {props.topBarRightItem}
                </Toolbar>
                <ViewModeOverlay
                    className={classnames(props.bodyClassName, 'ViewModeLayer-body')}
                    cameraMetrics={props.cameraMetrics}
                    setPhotoPosition={props.setPhotoPosition}
                />
            </>
        )
    }

}


function toSliderScale(percentage: number): number {
    const sliderScale = Math.max(0, Math.min(1, Math.sqrt(percentage)))

    // Workaround: For very small values (e.g. `6e-16`) the Slider widget shows no track bar
    // -> Pull small values to 0
    return sliderScale < 0.000001 ? 0 : sliderScale
}

function fromSliderScale(sliderScale: number): number {
    return sliderScale * sliderScale
}
