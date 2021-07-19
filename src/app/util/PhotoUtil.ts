import { getCollectionSize } from 'app/util/PhotoCollectionResolver'
import { PhotoActionController } from 'app/controller/PhotoActionController'
import { PhotoCollection } from 'app/state/StateTypes'
import toaster from 'app/Toaster'
import { msg } from 'common/i18n/i18n'
import { formatNumber } from 'common/util/TextUtil'

export function movePhotosToTrash(photos: PhotoCollection | null | undefined, controller: PhotoActionController) {
    if (!photos) return
    const photosCount = getCollectionSize(photos)
    if (photosCount == 0) return
    controller.movePhotosToTrash(photos)
    toaster.show({
        icon: 'tick',
        message: photosCount === 1 ? msg('PhotoActionButtons_movedToTrash_one') : msg('PhotoActionButtons_movedToTrash_more', formatNumber(photosCount)),
        intent: 'success'
    })
}
