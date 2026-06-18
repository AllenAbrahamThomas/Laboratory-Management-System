import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const session = authService.activeSession;
  if (session && session.token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Token ${session.token}`
      }
    });
    return next(authReq);
  }
  return next(req);
};
