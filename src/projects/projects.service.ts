import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { TasksService } from '../tasks/tasks.service';

const DASHBOARD_PROJECTS_LIMIT = 3;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private tasksService: TasksService,
  ) {}

  async create(
    userId: string,
    createProjectDto: CreateProjectDto,
  ): Promise<Project> {
    const createdProject = new this.projectModel({
      ...createProjectDto,
      userId,
    });
    return createdProject.save();
  }

  async findAll(userId: string): Promise<any[]> {
    // Single aggregation query instead of N+1 queries
    const projectsWithStats = await this.projectModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: 'tasks',
          let: { projectName: '$name', odId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$project', '$$projectName'] },
                    { $eq: ['$userId', '$$odId'] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalTasks: { $sum: 1 },
                completedTasks: {
                  $sum: { $cond: ['$completed', 1, 0] },
                },
              },
            },
          ],
          as: 'taskStats',
        },
      },
      {
        $addFields: {
          tasksCount: {
            $ifNull: [{ $arrayElemAt: ['$taskStats.totalTasks', 0] }, 0],
          },
          progress: {
            $cond: {
              if: {
                $gt: [{ $arrayElemAt: ['$taskStats.totalTasks', 0] }, 0],
              },
              then: {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $arrayElemAt: ['$taskStats.completedTasks', 0] },
                          { $arrayElemAt: ['$taskStats.totalTasks', 0] },
                        ],
                      },
                      100,
                    ],
                  },
                  0,
                ],
              },
              else: 0,
            },
          },
          teammates: { $ifNull: ['$teammates', 1] },
        },
      },
      { $project: { taskStats: 0 } },
    ]);

    return projectsWithStats;
  }

  async findOne(userId: string, id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  async getTasks(userId: string, projectId: string) {
    // Verify access first
    await this.findOne(userId, projectId);
    return this.tasksService.findByProject(userId, projectId);
  }

  async update(
    userId: string,
    id: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const updated = await this.projectModel
      .findByIdAndUpdate(id, updateProjectDto, { new: true })
      .exec();

    return updated!;
  }

  async remove(userId: string, id: string): Promise<Project> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project ${id} not found`);

    // Verify ownership
    if (project.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const deleted = await this.projectModel.findByIdAndDelete(id).exec();
    return deleted!;
  }

  async getStats(userId: string) {
    return {
      totalProjects: await this.projectModel.countDocuments({ userId }),
    };
  }

  async findDashboardProjects(userId: string) {
    return this.projectModel
      .find({ userId, status: 'active' })
      .limit(DASHBOARD_PROJECTS_LIMIT)
      .lean();
  }

  // Internal method for sync service
  async findByIdInternal(id: string): Promise<ProjectDocument | null> {
    return this.projectModel.findById(id).exec();
  }
}
