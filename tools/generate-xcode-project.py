"""Deterministic native iPhone/iPad target using the existing Swift modules."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
def uid(s):return hashlib.sha256(s.encode()).hexdigest()[:24].upper()
objects=[]
def obj(name,body): objects.append(f'{uid(name)} = {{ {body} }};');return uid(name)
appfiles=sorted((root/'apple/Sources/EnvelopApp').glob('*.swift'))
refs=[];builds=[]
for file in appfiles:
 ref=obj(str(file.name),f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "Sources/EnvelopApp/{file.name}"; sourceTree = "<group>";');refs.append(ref)
 builds.append(obj('build'+file.name,f'isa = PBXBuildFile; fileRef = {ref};'))
product=obj('product','isa = PBXFileReference; explicitFileType = wrapper.application; path = Envelop.app; sourceTree = BUILT_PRODUCTS_DIR;')
products=obj('products',f'isa = PBXGroup; children = ({product}); name = Products; sourceTree = "<group>";')
main=obj('main',f'isa = PBXGroup; children = ({",".join(refs+[products])}); sourceTree = "<group>";')
package=obj('package','isa = XCLocalSwiftPackageReference; relativePath = .;')
deps=[];frameworks=[]
for name in ['EnvelopCore','EnvelopBLE']:
 dep=obj('dep'+name,f'isa = XCSwiftPackageProductDependency; productName = {name};');deps.append(dep)
 frameworks.append(obj('framework'+name,f'isa = PBXBuildFile; productRef = {dep};'))
sources=obj('sources',f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(builds)}); runOnlyForDeploymentPostprocessing = 0;')
framework=obj('frameworks',f'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ({",".join(frameworks)}); runOnlyForDeploymentPostprocessing = 0;')
resources=obj('resources','isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
for prefix in ['project','target']:
 cs=[]
 for config in ['Debug','Release']:
  settings='CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0; IPHONEOS_DEPLOYMENT_TARGET = 17.0;'
  if prefix=='target':settings+=' PRODUCT_BUNDLE_IDENTIFIER = com.tmarhguy.envelop; PRODUCT_NAME = Envelop; GENERATE_INFOPLIST_FILE = YES; INFOPLIST_FILE = ios/Info.plist; TARGETED_DEVICE_FAMILY = "1,2"; SDKROOT = iphoneos; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; CODE_SIGN_STYLE = Automatic; MARKETING_VERSION = 0.2.0; CURRENT_PROJECT_VERSION = 2; INFOPLIST_KEY_UILaunchScreen_Generation = YES;'
  settings+=' SWIFT_OPTIMIZATION_LEVEL = "'+('-Onone' if config=='Debug' else '-O')+'";'
  cs.append(obj(prefix+config,f'isa = XCBuildConfiguration; buildSettings = {{{settings}}}; name = {config};'))
 obj(prefix+'config',f'isa = XCConfigurationList; buildConfigurations = ({",".join(cs)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
target=obj('target',f'isa = PBXNativeTarget; buildConfigurationList = {uid("targetconfig")}; buildPhases = ({sources},{framework},{resources}); buildRules = (); dependencies = (); name = Envelop; packageProductDependencies = ({",".join(deps)}); productName = Envelop; productReference = {product}; productType = "com.apple.product-type.application";')
obj('project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {uid("projectconfig")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en,Base); mainGroup = {main}; packageReferences = ({package}); productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = ({target});')
(root/'apple/Envelop.xcodeproj/project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {uid("project")}; }}\n')
(root/'apple/Envelop.xcodeproj/xcshareddata/xcschemes/Envelop.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="Envelop.app" BlueprintName="Envelop" ReferencedContainer="container:Envelop.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="Envelop.app" BlueprintName="Envelop" ReferencedContainer="container:Envelop.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
