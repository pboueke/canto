<p align="center"><img width="300" height="300" src="./android/app/src/main/assets/images/logo_t_v1_256.png"></p>

# About

Canto is am entirely free, simple journaling app for Android. 
It's built with `react-native` an may one day be ported to *ios*. 
It's meant to resolve frustrations with the current *journaling mobile app*
ecosystem - pointless features, insane charges and 'DiaryAsAService'-BS.

Features:

* Completely free and open source
* Management of multiple journals
* Local encryption
* Automated backups with Drive

---

&nbsp;

# Development

1. Connect your phone or emulator using Android Studio

2. Run JS Server on a terminal 

*Console #1*
```
> react-native start 
```

3. Compile and install Canto

*Console #1*
```
> yarn android
```

---

&nbsp;

# Build

## Android

### Issues derived from `mmkv-storage` 

This project uses [react-native-mmkv-storage](https://github.com/ammarahm-ed/react-native-mmkv-storage). If the  project wont build after following the [installation instrunctions](https://rnmmkv.vercel.app/#/gettingstarted), you may need to follow these steps:

1. In the Android Studio SDK Manager, install CMake 3.10 and make sure it is the only version available. 

2. In the Android Studio Manager, install NDK 21.4.7075529 and make sure it is the only version available. 


3. Specify CMake version at MMKV's `build.gradle` file.

* Automated option: run the `fix-mmkv` script: `yarn fix-mmkv` (also included in the `yarn android` script)

* Manual option: enter `node_modules/react-native-mmkv-storage/android/build.gradle` and make sure that the CMake version above is specified at `externalNativeBuild`. Like so:

```
externalNativeBuild {
    cmake {
        path "./src/main/rnmkv/CMakeLists.txt"
        version "3.10.2"
    }
}
```

The previous steps came from this [related discussion](https://github.com/ammarahm-ed/react-native-mmkv-storage/issues/67#issuecomment-801467636). If they didn´t work, try the following:

4. Delete and reinstall node_modules, apply step **3**

5. Clean your project with `./gradlew clean` or Android Studio

6. In Android Studio, run **Build** -> **Refresh Linked C++ Projects**

The current build process is not deterministic. The previous steps work sometimes, fail others. I am still trying to figure it out. Currently, follow steps 1 to 3 and repeat 5 and 6 untill the project can be built (help needed).