import React from 'react'
import { Button, Classes } from '@blueprintjs/core'

import { msg } from 'common/i18n/i18n'
import { bindMany } from 'common/util/LangUtil'
import { formatNumber } from 'common/util/TextUtil'

import { PhotoActionController } from 'app/controller/PhotoActionController'
import { PhotoCollection } from 'app/state/StateTypes'
import toaster from 'app/Toaster'
import MdRestoreFromTrash from 'app/ui/widget/icon/MdRestoreFromTrash'
import { getCollectionSize } from 'app/util/PhotoCollectionResolver'

import RotateButtonGroup from './RotateButtonGroup'

import {movePhotosToTrash} from 'app/util/PhotoUtil'

interface Props {
    selectedPhotos: PhotoCollection | null
    isShowingTrash: boolean
    isShowingInfo: boolean
    photoActionController: PhotoActionController
    toggleShowInfo: () => void
}

export default class PhotoActionButtons extends React.Component<Props> {

    constructor(props: Props) {
        super(props)
        bindMany(this, 'onRotate', 'toggleFlagged', 'moveToTrash', 'restoreFromTrash', 'openExport')
    }

    private onRotate(turns: number) {
        const { props } = this
        if (props.selectedPhotos) {
            props.photoActionController.rotatePhotos(props.selectedPhotos, turns)
        }
    }

    private toggleFlagged() {
        const { props } = this
        if (props.selectedPhotos) {
            const newFlagged = !this.getSelectedAreFlagged()
            props.photoActionController.setPhotosFlagged(props.selectedPhotos, newFlagged)
        }
    }

    private getSelectedAreFlagged() {
        const { props } = this
        return props.photoActionController.getPhotosAreFlagged(props.selectedPhotos)
    }

    private moveToTrash() {
        const { props } = this
        movePhotosToTrash(props.selectedPhotos, props.photoActionController)
    }

    private restoreFromTrash() {
        const { props } = this
        if (props.selectedPhotos) {
            const photosCount = getCollectionSize(props.selectedPhotos)
            props.photoActionController.restorePhotosFromTrash(props.selectedPhotos)
            toaster.show({
                icon: 'tick',
                message: photosCount === 1 ? msg('PhotoActionButtons_restoredFromTrash_one') : msg('PhotoActionButtons_restoredFromTrash_more', formatNumber(photosCount)),
                intent: 'success'
            })
        }
    }

    private openExport() {
        const props = this.props
        if (props.selectedPhotos) {
            props.photoActionController.openExport(props.selectedPhotos)
        }
    }

    render() {
        const props = this.props
        const hasSelection = getCollectionSize(props.selectedPhotos) > 0
        const selectedAreFlagged = this.getSelectedAreFlagged()

        // TODO: Revive Legacy code of 'version' feature
        //const availableEditors = new AvailableEditors();
        //availableEditors.editors.forEach(editor =>
        //  this.menu.append(new MenuItem({
        //      label: `Open with ${editor.name}`,
        //      click: () => {
        //          createVersionAndOpenWith(
        //              this.props.photo,
        //              editor.format,
        //              editor.cmd
        //          );
        //      }
        //  }));
        //)

        return (
            <>
                <RotateButtonGroup disabled={!hasSelection} onRotate={this.onRotate}/>
                <Button
                    icon={selectedAreFlagged ? 'star' : 'star-empty'}
                    minimal={true}
                    active={selectedAreFlagged}
                    disabled={!hasSelection}
                    onClick={this.toggleFlagged}
                    title={selectedAreFlagged ? msg('PhotoActionButtons_removeFavorite') : msg('PhotoActionButtons_addFavorite')}
                />
                {!props.isShowingTrash &&
                    <Button minimal={true} icon="trash" disabled={!hasSelection} onClick={this.moveToTrash} title={msg('PhotoActionButtons_trash')}/>
                }
                {props.isShowingTrash &&
                    <Button
                        disabled={!hasSelection}
                        intent={hasSelection ? 'success' : undefined}
                        title={msg('PhotoActionButtons_restoreFromTrash')}
                        onClick={this.restoreFromTrash}
                    >
                        <MdRestoreFromTrash/>
                        <span className={Classes.BUTTON_TEXT}>{msg('PhotoActionButtons_restore')}</span>
                    </Button>
                }
                <Button
                    minimal={true}
                    icon="info-sign"
                    title={msg('PhotoActionButtons_photoInfo')}
                    active={props.isShowingInfo}
                    disabled={!hasSelection && !props.isShowingInfo}
                    onClick={this.props.toggleShowInfo}
                />
                <Button minimal={true} icon='export' disabled={!hasSelection} onClick={this.openExport} title={msg('PhotoActionButtons_export')}/>
            </>
        )    
    }
}
