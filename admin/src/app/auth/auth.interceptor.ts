import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // const token = localStorage.getItem('access_token'); // adjust key if needed
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJFbWFpbCI6ImRhc2NoYXlhbjg4MzdAZ21haWwuY29tIiwiaWF0IjoxNzUxMDQzNTk2LCJleHAiOjE3NTExMjk5OTZ9.yiLDpIaYl3rIVDTRBfu-2Z4aIFtr8DHGZh4d8D7-Bqw'; // or sessionStorage
// testing 
  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(authReq);
  }

  return next(req);
};
