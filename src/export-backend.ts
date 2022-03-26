import {
  CfnInclude,
  IncludedNestedStack,
} from 'aws-cdk-lib/cloudformation-include';
import * as cdk from 'aws-cdk-lib';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as _ from 'lodash';
import { AmplifyExportedBackendProps } from './amplify-exported-backend-props';
import { BaseAmplifyExportedBackend } from './base-exported-backend';
import { Constants } from './constants';
import { AmplifyExportAssetHandler } from './export-backend-asset-handler';
import {
  APIGraphQLIncludedNestedStack,
  APIRestIncludedStack,
  AuthIncludedNestedStack,
} from './include-nested-stacks';
import {
  LambdaFunctionIncludedNestedStack,
} from './include-nested-stacks/lambda-function/lambda-function-nested-stack';
import { CategoryStackMapping } from './types/category-stack-mapping';
import { Construct } from 'constructs'

const { API_CATEGORY, AUTH_CATEGORY, FUNCTION_CATEGORY } = Constants;

/***
 * Used to include the backend generated by running `amplify export --out <path>` into the cdk app
 * @example
 * @see <amplify-export-docs-path>
 */
export class AmplifyExportedBackend
  extends BaseAmplifyExportedBackend {
  /**
   * cfnInclude of the Amplify backend
   */
  cfnInclude: CfnInclude;
  /**
   * The root stack created
   */
  rootStack: cdk.Stack;

  /**
   * @param scope The parent construct of this template
   * @param id The ID of this construct
   * @param props Initialization properties.
   */
  constructor(
    scope: Construct,
    id: string,
    props: AmplifyExportedBackendProps,
  ) {
    super(scope, id, props.path, props.amplifyEnvironment);

    this.rootStack = new cdk.Stack(scope, `${id}-amplify-backend-stack`, {
      ...props,
      stackName: this.exportBackendManifest.stackName,
    });

    const amplifyExportHandler = new AmplifyExportAssetHandler(
      this.rootStack,
      'asset',
      {
        backendPath: props.path,
        categoryStackMapping: this.categoryStackMappings,
        env: props.amplifyEnvironment ? props.amplifyEnvironment : 'dev',
        exportManifest: this.exportBackendManifest,
      },
    );
    this.exportBackendManifest =
      amplifyExportHandler.createAssetsAndUpdateParameters();

    const include = new CfnInclude(
      this.rootStack,
      'AmplifyCfnInclude',
      this.transformTemplateFile(this.exportBackendManifest.props, this.exportPath),
    );

    this.cfnInclude = include;

    amplifyExportHandler.setDependencies(include);

    this.applyTags(this.rootStack, props.amplifyEnvironment);

  }

  private applyTags(rootStack: cdk.Stack, env: string = 'dev') {
    this.exportTags.forEach((tag) => {
      rootStack.tags.setTag(tag.key, tag.value.replace('{project-env}', env));
    });
  }

  /**
   * Method to get the auth stack
   * @returns the nested stack of type {IAuthIncludeNestedStack}
   * @throws {AmplifyCategoryNotFoundError} if the auth stack doesn't exist
   * @method
   * @function
   */
  authNestedStack(): AuthIncludedNestedStack {
    const cognitoResource = this.findResourceForNestedStack(
      AUTH_CATEGORY.NAME,
      AUTH_CATEGORY.SERVICE.COGNITO,
    );
    const stack = this.getCategoryNestedStack(cognitoResource);
    return new AuthIncludedNestedStack(stack);
  }

  /**
   * Use this to get the api graphql stack from the backend
   * @returns the nested stack of type {IAPIGraphQLIncludeNestedStack}
   * @
   * @throws {AmplifyCategoryNotFoundError} if the API graphql stack doesn't exist
   */
  graphqlNestedStacks(): APIGraphQLIncludedNestedStack {
    const categoryStackMapping = this.findResourceForNestedStack(
      API_CATEGORY.NAME,
      API_CATEGORY.SERVICE.APP_SYNC,
    );
    return new APIGraphQLIncludedNestedStack(
      this.getCategoryNestedStack(categoryStackMapping),
    );
  }

  /**
   * Use this to get all the lambda functions from the backend
   * @returns {ILambdaFunctionIncludedNestedStack[]}
   * @throws {AmplifyCategoryNotFoundError} if the no Lambda Function stacks are found
   */
  lambdaFunctionNestedStacks(): LambdaFunctionIncludedNestedStack[] {
    return this.filterCategory(
      FUNCTION_CATEGORY.NAME,
      FUNCTION_CATEGORY.SERVICE.LAMBDA_FUNCTION,
    )
      .map((category) => this.getCategoryNestedStack(category))
      .map((stack) => new LambdaFunctionIncludedNestedStack(stack));
  }

  /**
   * Use this to get a specific lambda function from the backend
   * @returns {ILambdaFunctionIncludedNestedStack}
   * @param functionName the function name to get from the nested stack
   * @throws {AmplifyCategoryNotFoundError} if the lambda function stack doesn't exist
   */
  lambdaFunctionNestedStackByName(
    functionName: string,
  ): LambdaFunctionIncludedNestedStack {
    const category = this.findResourceForNestedStack(
      FUNCTION_CATEGORY.NAME,
      FUNCTION_CATEGORY.SERVICE.LAMBDA_FUNCTION,
      functionName,
    );
    return new LambdaFunctionIncludedNestedStack(
      this.getCategoryNestedStack(category),
    );
  }

  nestedStackByCategortService(category: string, service: string) : IncludedNestedStack[] {
    return this.filterCategory(category, service).map(categoryMapping => this.getCategoryNestedStack(categoryMapping));
  }

  /**
   * Returns the stacks defined in the backend
   * @param category Categories defined in Amplify CLI like function, api, auth etc
   * @param resourceName @default is undefined
   */
  nestedStacksByCategory(
    category: string,
    resourceName?: string,
  ): IncludedNestedStack[] {
    return this.filterCategory(category, undefined, resourceName).map(
      this.getCategoryNestedStack,
    );
  }

  /**
   * Use this to get rest api stack from the backend
   * @param resourceName
   * @return {IAPIRestIncludedStack} the nested of type Rest API
   * @throws {AmplifyCategoryNotFoundError} if the API Rest stack doesn't exist
   */
  apiRestNestedStack(resourceName: string): APIRestIncludedStack {
    const categoryStackMapping = this.findResourceForNestedStack(
      API_CATEGORY.NAME,
      API_CATEGORY.SERVICE.API_GATEWAY,
      resourceName,
    );
    const stack = this.getCategoryNestedStack(categoryStackMapping);
    return new APIRestIncludedStack(stack, resourceName);
  }

  private getCategoryNestedStack(
    categoryStackMapping: CategoryStackMapping,
  ): IncludedNestedStack {
    return this.cfnInclude.getNestedStack(
      categoryStackMapping.category + categoryStackMapping.resourceName,
    );
  }
}
