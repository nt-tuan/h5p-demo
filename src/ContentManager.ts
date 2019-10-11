import { ReadStream } from 'fs';
import fsExtra from 'fs-extra';
import globPromise from 'glob-promise';
import * as path from 'path';
import { Stream } from 'stream';

import { streamToString } from './helpers/StreamHelpers';

import {
    Content,
    ContentId,
    IContentMetadata,
    IContentStorage,
    IUser,
    Permission
} from './types';

/**
 * The ContentManager takes care of saving content and dependent files. It only contains storage-agnostic functionality and
 * depends on a ContentStorage object to do the actual persistence.
 */
export default class ContentManager {
    /**
     * @param {FileContentStorage} contentStorage The storage object
     */
    constructor(contentStorage: IContentStorage) {
        this.contentStorage = contentStorage;
    }

    private contentStorage: IContentStorage;

    /**
     * Adds a content file to an existing content object. The content object has to be created with createContent(...) first.
     * @param {number} contentId The id of the content to add the file to
     * @param {string} filename The filename INSIDE the content folder
     * @param {Stream} stream A readable stream that contains the data
     * @param {IUser} user The user who owns this object
     * @returns {Promise<void>}
     */
    public async addContentFile(
        contentId: ContentId,
        filename: string,
        stream: Stream,
        user: IUser
    ): Promise<void> {
        return this.contentStorage.addContentFile(
            contentId,
            filename,
            stream,
            user
        );
    }

    /**
     * Checks if a piece of content exists.
     * @param contentId the content to check
     * @returns true if the piece of content exists
     */
    public async contentExists(contentId: ContentId): Promise<boolean> {
        return this.contentStorage.contentExists(contentId);
    }

    /**
     * Adds content from a H5P package (in a temporary directory) to the installation.
     * It does not check whether the user has permissions to save content.
     * @param {string} packageDirectory The absolute path containing the package (the directory containing h5p.json)
     * @param {IUser} user The user who is adding the package.
     * @param {number} contentId (optional) The content id to use for the package
     * @returns {Promise<string>} The id of the content that was created (the one passed to the method or a new id if there was none).
     */
    public async copyContentFromDirectory(
        packageDirectory: string,
        user: IUser,
        contentId?: ContentId
    ): Promise<ContentId> {
        const metadata: IContentMetadata = await fsExtra.readJSON(
            path.join(packageDirectory, 'h5p.json')
        );
        const content: Content = await fsExtra.readJSON(
            path.join(packageDirectory, 'content', 'content.json')
        );
        const otherContentFiles: string[] = (await globPromise(
            path.join(packageDirectory, 'content', '**/*.*')
        )).filter(
            (file: string) =>
                path.relative(packageDirectory, file) !== 'content.json'
        );

        const newContentId: ContentId = await this.contentStorage.createContent(
            metadata,
            content,
            user,
            contentId
        );
        try {
            await Promise.all(
                otherContentFiles.map((file: string) => {
                    const readStream: Stream = fsExtra.createReadStream(file);
                    const localPath: string = path.relative(
                        path.join(packageDirectory, 'content'),
                        file
                    );
                    return this.contentStorage.addContentFile(
                        newContentId,
                        localPath,
                        readStream
                    );
                })
            );
        } catch (error) {
            await this.contentStorage.deleteContent(newContentId);
            throw error;
        }
        return newContentId;
    }

    /**
     * Creates a content object in the repository. Add files to it later with addContentFile(...).
     * @param {any} metadata The metadata of the content (= h5p.json)
     * @param {any} content the content object (= content/content.json)
     * @param {IUser} user The user who owns this object.
     * @param {number} contentId (optional) The content id to use
     * @returns {Promise<string>} The newly assigned content id
     */
    public async createContent(
        metadata: IContentMetadata,
        content: Content,
        user: IUser,
        contentId: ContentId
    ): Promise<ContentId> {
        return this.contentStorage.createContent(
            metadata,
            content,
            user,
            contentId
        );
    }

    /**
     * Generates a unique content id that hasn't been used in the system so far.
     * @returns {Promise<number>} A unique content id
     */
    public async createContentId(): Promise<ContentId> {
        return this.contentStorage.createContentId();
    }

    public async getContentFiles(
        contentId: ContentId,
        user: IUser
    ): Promise<string[]> {
        return this.contentStorage.getContentFiles(contentId, user);
    }

    /**
     * Returns a readable stream of a content file (e.g. image or video) inside a piece of content
     * @param {number} contentId the id of the content object that the file is attached to
     * @param {string} filename the filename of the file to get (you have to add the "content/" directory if needed)
     * @param {IUser} user the user who wants to retrieve the content file
     * @returns {Stream}
     */
    public getContentFileStream(
        contentId: ContentId,
        filename: string,
        user: IUser
    ): ReadStream {
        return this.contentStorage.getContentFileStream(
            contentId,
            filename,
            user
        );
    }

    /**
     * Returns an array of permissions a user has on a piece of content.
     * @param contentId the content to check
     * @param user the user who wants to access the piece of content
     * @returns an array of permissions
     */
    public async getUserPermissions(
        contentId: ContentId,
        user: IUser
    ): Promise<Permission[]> {
        return this.contentStorage.getUserPermissions(contentId, user);
    }

    /**
     * Returns the content object (=contents of content/content.json) of a piece of content.
     * @param {number} contentId the content id
     * @param {IUser} user The user who wants to access the content
     * @returns {Promise<any>}
     */
    public async loadContent(
        contentId: ContentId,
        user: IUser
    ): Promise<Content> {
        return this.getFileJson(contentId, 'content/content.json', user);
    }

    /**
     * Returns the metadata (=contents of h5p.json) of a piece of content.
     * @param {number} contentId the content id
     * @param {IUser} user The user who wants to access the content
     * @returns {Promise<any>}
     */
    public async loadH5PJson(
        contentId: ContentId,
        user: IUser
    ): Promise<IContentMetadata> {
        return this.getFileJson(contentId, 'h5p.json', user);
    }

    /**
     * Returns the decoded JSON data inside a file
     * @param {number} contentId The id of the content object that the file is attached to
     * @param {string} file The filename to get (relative to main dir, you have to add "content/" if you want to access a content file)
     * @param {IUser} user The user who wants to acces this object
     * @returns {Promise<any>}
     */
    private async getFileJson(
        contentId: ContentId,
        file: string,
        user: IUser
    ): Promise<any> {
        const stream: Stream = this.contentStorage.getContentFileStream(
            contentId,
            file,
            user
        );
        const jsonString: string = await streamToString(stream);
        return JSON.parse(jsonString);
    }
}