import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PomodoroService } from './pomodoro.service';
import { PomodoroSession } from './schemas/pomodoro-session.schema';

describe('PomodoroService', () => {
  let service: PomodoroService;

  const mockSessionModel = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PomodoroService,
        {
          provide: getModelToken(PomodoroSession.name),
          useValue: mockSessionModel,
        },
      ],
    }).compile();

    service = module.get<PomodoroService>(PomodoroService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
