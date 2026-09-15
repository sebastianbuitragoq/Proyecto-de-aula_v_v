import { Router } from 'express'
import { favoritePhoneParamDto } from '../../application/dtos/favorite.dto'
import { add, list, remove } from '../controllers/favorites.controller'
import { authenticate } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'

const router = Router()

// La lista es de cada quien: basta con estar autenticado, sin rol de
// administrador. El userId sale del token, nunca de la URL, así que un
// usuario no puede leer ni modificar los favoritos de otro.
router.use(authenticate)

router.get('/', list)
router.post('/:phoneId', validate(favoritePhoneParamDto, 'params'), add)
router.delete('/:phoneId', validate(favoritePhoneParamDto, 'params'), remove)

export default router
