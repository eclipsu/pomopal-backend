import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              const values: Record<string, unknown> = {
                SMTP_HOST: 'smtp.example.com',
                SMTP_PORT: 587,
                SMTP_SECURE: 'false',
                SMTP_USER: 'user',
                SMTP_PASS: 'pass',
                SMTP_FROM: 'noreply@example.com',
                SMTP_FROM_NAME: 'Pomopal',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
