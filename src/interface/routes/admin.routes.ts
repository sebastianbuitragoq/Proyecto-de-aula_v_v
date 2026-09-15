import { Router } from 'express'
import {
  alerts,
  ban,
  changeRole,
  stats,
  unban,
  users,
} from '../controllers/admin.controller'
import { authenticate, requireAdmin } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { banUserDto, changeRoleDto } from '../../application/dtos/admin.dto'

const router = Router()

// Todas las rutas de admin requieren autenticación + rol ADMIN
router.use(authenticate, requireAdmin)

router.get('/stats', stats)
router.get('/users', users)
router.get('/alerts', alerts)
router.put('/users/:id/ban', validate(banUserDto), ban)
router.put('/users/:id/unban', unban)
router.put('/users/:id/role', validate(changeRoleDto), changeRole)

export default router
