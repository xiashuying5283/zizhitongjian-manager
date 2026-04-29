import { Express, NextFunction, Request, Response } from 'express';
type SendSuccess = (res: Response, data: unknown) => void;
type SendError = (res: Response, message: string, statusCode?: number) => void;
export declare const authMiddleware: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare function registerAuthRoutes(app: Express, apiPrefix: string, sendSuccess: SendSuccess, sendError: SendError): void;
export {};
//# sourceMappingURL=auth.d.ts.map